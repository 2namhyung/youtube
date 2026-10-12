import json
import math
import shutil
import threading
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from pydantic import ValidationError
from apps.api.store import Gate, require, now, uid, canonical, digest, physical
from packages.contracts.models import STAGE_MODELS, VERSION, Crop, RenderManifest
from packages.providers.luna import packet
from workers.media.engine import Media
from workers.discovery.outliers import analyze


STAGES = ["discovery", "product", "queries", "ingest", "observe", "script", "timeline", "voice", "sound", "render", "review"]
INVALIDATE = {
    "product": ["queries_id", "script_id", "script_review_id", "voice_id", "timeline_id", "render_id", "render_review_id", "export_id"],
    "ingest": ["timeline_id", "render_id", "render_review_id", "export_id"],
    "observe": ["timeline_id", "render_id", "render_review_id", "export_id"],
    "script": ["script_review_id", "voice_id", "timeline_id", "render_id", "render_review_id", "export_id"],
    "voice": ["timeline_id", "render_id", "render_review_id", "export_id"],
    "timeline": ["render_id", "render_review_id", "export_id"],
    "render": ["render_review_id", "export_id"],
}


class Pipeline:
    def __init__(self, store):
        self.store = store
        self.stop = threading.Event()
        self.wake = threading.Event()
        self.thread = None

    def start(self):
        # Local media is restartable; no external paid provider is called here.
        with self.store.transaction() as db:
            db.execute("UPDATE jobs SET state='RETRYABLE_FAILURE',error_json=?,updated_at=? WHERE state='RUNNING'",
                       (canonical({"code": "WORKER_INTERRUPTED", "message": "Restart with a new request; completed immutable inputs are preserved"}), now()))
        self.thread = threading.Thread(target=self.loop, name="shopping-media-worker", daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        self.wake.set()
        if self.thread:
            self.thread.join(timeout=15)

    def loop(self):
        while not self.stop.is_set():
            queued = self.store.rows("SELECT id FROM jobs WHERE state='QUEUED' ORDER BY created_at LIMIT 1")
            if queued:
                self.execute(queued[0]["id"])
            else:
                self.wake.wait(1)
                self.wake.clear()

    def job(self, job_id):
        rows = self.store.rows("SELECT * FROM jobs WHERE id=?", (job_id,))
        require(rows, "NOT_FOUND", "Job not found", 404)
        row = rows[0]
        for key in ("input", "output", "error"):
            row[key] = json.loads(row.pop(f"{key}_json"))
        return row

    def enqueue(self, project_id, stage, request, key):
        require(stage in STAGES, "UNKNOWN_STAGE", "Unknown pipeline stage")
        require(key and len(key) <= 200, "IDEMPOTENCY_REQUIRED", "Idempotency-Key is required", 400)
        request_hash = digest({"stage": stage, "request": request})
        scope = f"{project_id}:{stage}"
        with self.store.transaction() as db:
            previous = db.execute("SELECT * FROM idempotency WHERE scope=? AND key=?", (scope, key)).fetchone()
            if previous:
                require(previous["request_hash"] == request_hash, "IDEMPOTENCY_CONFLICT", "Same key has different input", 409)
                return json.loads(previous["response_json"])
            p = self.store.check_revision(project_id, request["expected_revision"])
            require(not db.execute("SELECT id FROM jobs WHERE project_id=? AND state IN ('QUEUED','RUNNING','WAITING_INPUT')", (project_id,)).fetchone(),
                    "PROJECT_BUSY", "Complete or cancel the current job first", 409)
            job_id = uid("job")
            data = {"payload": request["payload"], "dependencies": p["state"], "version": VERSION}
            ts = now()
            db.execute("INSERT INTO jobs(id,project_id,stage,revision,state,input_json,input_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                       (job_id, project_id, stage, p["revision"], "QUEUED", canonical(data), digest(data), ts, ts))
            response = {"job_id": job_id, "status_url": f"/v1/jobs/{job_id}"}
            db.execute("INSERT INTO idempotency VALUES(?,?,?,?)", (scope, key, request_hash, canonical(response)))
        self.wake.set()
        return response

    def context(self, project_id):
        p = self.store.project(project_id)
        records = {}
        for k, v in p["state"].items():
            if k.endswith("_id") and v:
                records[k] = self.store.get(v)
        records["shots"] = self.store.list("shot", project_id)
        records["observations"] = self.store.list("observation", project_id)
        records["receipts"] = self.store.list("receipt", project_id)
        records["sounds"] = self.store.list("sound", project_id)
        return {"project": p, "records": records}

    def submit(self, job_id, completion):
        job = self.job(job_id)
        require(job["state"] == "WAITING_INPUT", "NOT_WAITING", "Job is not waiting for input", 409)
        require(packet(job, {})["binding"] == completion["binding"], "BINDING_MISMATCH", "Result belongs to a different job", 409)
        self.store.check_revision(job["project_id"], job["revision"])
        model = STAGE_MODELS[job["stage"]]
        result = model.model_validate(completion["result"]).model_dump(mode="json")
        with self.store.transaction() as db:
            require(db.execute("SELECT state FROM jobs WHERE id=?", (job_id,)).fetchone()[0] == "WAITING_INPUT", "NOT_WAITING", "Job changed", 409)
            self.store.record("submission", {"job_id": job_id, "binding": completion["binding"], "result": result}, job["project_id"], db)
            job["input"]["payload"] = result
            db.execute("UPDATE jobs SET state='QUEUED',input_json=?,updated_at=? WHERE id=?", (canonical(job["input"]), now(), job_id))
        self.wake.set()
        return self.job(job_id)

    def cancel(self, job_id):
        with self.store.transaction() as db:
            job = self.job(job_id)
            require(job["state"] in {"QUEUED", "RUNNING", "WAITING_INPUT", "RETRYABLE_FAILURE"}, "JOB_TERMINAL", "Job already finished", 409)
            db.execute("UPDATE jobs SET state='CANCELLED',updated_at=? WHERE id=?", (now(), job_id))
        return self.job(job_id)

    def receipts(self, ids, project_id):
        for rid in ids:
            r = self.store.get(rid, "receipt")
            require(r["project_id"] == project_id and not self.store.revoked(rid), "EVIDENCE_UNAVAILABLE", "Receipt is unavailable to this project")
            self.store.blob(r["data"]["blob_id"])
        return ids

    def attestation(self, data, project):
        att = data.get("attestation")
        if att:
            self.receipts(att["receipt_ids"], project["id"])
            require(project["state"]["mode"] == "synthetic-test" or att["surface"] != "fixture", "SYNTHETIC_EVIDENCE", "Fixture evidence cannot enter a production project")

    def execute(self, job_id):
        with self.store.transaction() as db:
            job = self.job(job_id)
            if job["state"] != "QUEUED":
                return
            db.execute("UPDATE jobs SET state='RUNNING',updated_at=? WHERE id=?", (now(), job_id))
        try:
            p = self.store.check_revision(job["project_id"], job["revision"])
            data, stage = job["input"]["payload"], job["stage"]
            if not data and stage not in {"timeline", "render"}:
                instructions = packet(job, self.context(p["id"]))
                with self.store.transaction() as db:
                    if self.job(job_id)["state"] != "CANCELLED":
                        db.execute("UPDATE jobs SET state='WAITING_INPUT',output_json=?,error_json=?,updated_at=? WHERE id=?",
                                   (canonical({"operator_packet": instructions}), canonical({"code": "WAITING_MEDIA" if stage == "ingest" else "LUNA_INPUT_REQUIRED", "message": instructions["instructions"]}), now(), job_id))
                return
            if stage in STAGE_MODELS:
                data = STAGE_MODELS[stage].model_validate(data).model_dump(mode="json")
            self.attestation(data, p)
            work = physical(self.store.root / "work" / uid(job_id), self.store.root)
            work.mkdir()
            media = Media(self.store, lambda: self.stop.is_set() or self.job(job_id)["state"] == "CANCELLED")
            changes, output = self.dispatch(stage, data, p, media, work)
            with self.store.transaction() as db:
                require(self.job(job_id)["state"] != "CANCELLED" and not self.stop.is_set(), "CANCELLED", "Job cancelled")
                current = self.store.check_revision(p["id"], p["revision"])
                state = current["state"]
                for key in INVALIDATE.get(stage, []):
                    state.pop(key, None)
                state.update(changes)
                db.execute("UPDATE projects SET revision=revision+1,json=? WHERE id=? AND revision=?", (canonical(state), p["id"], p["revision"]))
                self.store.record("checkpoint", {"job_id": job_id, "stage": stage, "input_hash": job["input_hash"], "state": state}, p["id"], db)
                db.execute("UPDATE jobs SET state='SUCCEEDED',output_json=?,error_json='{}',updated_at=? WHERE id=?", (canonical(output), now(), job_id))
        except Exception as e:
            error = {"code": e.code, "message": e.message} if isinstance(e, Gate) else {"code": "INVALID_INPUT" if isinstance(e, ValidationError) else "WORKER_FAILED", "message": str(e)[:1200] if isinstance(e, ValidationError) else type(e).__name__}
            with self.store.transaction() as db:
                if self.job(job_id)["state"] != "CANCELLED":
                    needs_input = error["code"] in {"WAITING_EXACT_SHOT", "NO_VALID_EXACT_SHOT", "TIMELINE_UNSATISFIABLE", "ANALYTICS_NOT_AUTHORIZED", "CLEAN_SOURCE_REQUIRED"} and job["stage"] in STAGE_MODELS
                    if needs_input:
                        output = {"required_input": error, "operator_packet": packet(job, self.context(job["project_id"]))}
                        db.execute("UPDATE jobs SET state='WAITING_INPUT',error_json=?,output_json=?,updated_at=? WHERE id=?", (canonical(error), canonical(output), now(), job_id))
                        return
                    db.execute("UPDATE jobs SET state='FAILED',error_json=?,updated_at=? WHERE id=?", (canonical(error), now(), job_id))

    def current(self, p, key, kind):
        require(p["state"].get(key), "PREREQUISITE_MISSING", f"Complete {kind} first")
        return self.store.get(p["state"][key], kind)

    def dispatch(self, stage, data, p, media, work):
        pid = p["id"]
        if stage == "discovery":
            if p["state"]["mode"] != "synthetic-test":
                approval = self.store.rows("SELECT json FROM settings WHERE key=?", (f"analytics_authorization:{pid}",))
                if not approval:
                    approval = self.store.rows("SELECT json FROM settings WHERE key='analytics_authorization'")
                require(approval, "ANALYTICS_NOT_AUTHORIZED", "Register analytics-use evidence before analyzing platform observations")
                authorization = json.loads(approval[0]["json"])
                require(authorization.get("project_id") == pid, "ANALYTICS_NOT_AUTHORIZED", "Analytics authorization belongs to another project")
                self.receipts([authorization["receipt_id"]], pid)
                require(all(s["provider"] in authorization["providers"] for s in data["snapshots"]), "ANALYTICS_NOT_AUTHORIZED", "Provider is outside analytics approval scope")
            for s in data["snapshots"]:
                self.receipts([s["receipt_id"]], pid)
            rid = self.store.record("outlier", {"result": analyze(data), "observations": data}, pid)
            return {"discovery_id": rid}, self.store.get(rid)
        if stage == "product":
            for claim in data["claims"]:
                self.receipts(claim["receipt_ids"], pid)
            rid = self.store.record("product", data, pid)
            return {"product_id": rid}, self.store.get(rid)
        if stage == "queries":
            product = self.current(p, "product_id", "product")["data"]
            require(all(product["model"].casefold() in q.casefold() for qs in data["queries"].values() for q in qs), "MODEL_DROPPED", "Keep the exact model in every query")
            rid = self.store.record("queries", data, pid)
            return {"queries_id": rid}, self.store.get(rid)
        if stage == "ingest":
            self.receipts(data["rights"]["receipt_ids"], pid)
            result = media.ingest(data["blob_id"], work)
            shots = result.pop("shots")
            result["rights"] = data["rights"]
            asset_id = self.store.record("asset", result, pid)
            ids = []
            for shot in shots:
                shot["asset_id"] = asset_id
                ids.append(self.store.record("shot", shot, pid))
            return {"asset_ids": [*p["state"].get("asset_ids", []), asset_id]}, {"asset_id": asset_id, "shot_ids": ids}
        if stage == "sound":
            self.receipts(data["rights"]["receipt_ids"], pid)
            result = media.voice([{"blob_id": data["blob_id"], "beat_id": "sound"}], work)
            result = {**data, "original_blob_id": data["blob_id"], "blob_id": result["blob_id"], "sample_count": result["sample_count"]}
            rid = self.store.record("sound", result, pid)
            return {"sound_ids": [*p["state"].get("sound_ids", []), rid]}, self.store.get(rid)
        if stage == "observe":
            shot = self.store.get(data["shot_id"], "shot")
            require(shot["project_id"] == pid, "WRONG_PROJECT", "Shot is in a different project")
            asset = self.usable_asset(shot["data"]["asset_id"], pid)
            require(shot["data"]["start_frame"] <= data["start_frame"] < data["end_frame"] <= shot["data"]["end_frame"], "SHOT_RANGE", "Observed action must be within its shot")
            expected_frames = {f["blob_id"] for f in shot["data"]["frames"]}
            require(len(set(data["frame_ids"])) >= 3 and set(data["frame_ids"]) <= expected_frames, "FRAME_BINDING", "Use decoded frames from this shot")
            for frame_id in data["frame_ids"]:
                self.store.blob(frame_id)
            product = self.current(p, "product_id", "product")
            if data["usage_role"] == "EXACT_PRODUCT" and data["product_match"] == "same_model_same_variant":
                require(data["product_model"] == product["data"]["model"] and data["product_variant"] == product["data"]["variant"], "PRODUCT_MISMATCH", "Model or option conflicts with confirmed product")
            data.update({"product_id": product["id"], "asset_hash": asset["hash"], "evidence_type": "operator-attested-observation"})
            rid = self.store.record("observation", data, pid)
            return {}, self.store.get(rid)
        if stage == "script":
            product = self.current(p, "product_id", "product")
            claims = {c["id"]: c for c in product["data"]["claims"]}
            self.receipts(data["reference_receipt_ids"], pid)
            for beat in data["beats"]:
                require(set(beat["claim_ids"]) <= set(claims), "UNKNOWN_CLAIM", "Script refers to an unregistered claim")
                for cid in beat["claim_ids"]:
                    c = claims[cid]
                    require(c["level"] != "unverified", "UNVERIFIED_CLAIM", "Unverified claim cannot enter narration")
                    require(not c["expires_at"] or datetime.fromisoformat(c["expires_at"]) > datetime.now(timezone.utc), "CLAIM_EXPIRED", "Claim has expired")
                require(beat["usage_role"] != "EXACT_PRODUCT" or beat["claim_ids"], "CLAIM_REQUIRED", "Product demonstrations need claim evidence")
                for sid in beat["shot_ids"]:
                    self.eligible_observation(sid, beat["usage_role"], p)
            data["product_id"] = product["id"]
            rid = self.store.record("script", data, pid)
            return {"script_id": rid}, self.store.get(rid)
        if stage == "voice":
            script = self.current(p, "script_id", "script")
            self.script_approved(p)
            require(data["script_id"] == script["id"], "STALE_SCRIPT", "Voice belongs to a superseded script")
            require([s["beat_id"] for s in data["segments"]] == [b["id"] for b in script["data"]["beats"]], "VOICE_BEAT_ORDER", "Supply one audio file per beat in script order")
            result = media.voice(data["segments"], work)
            result.update(data)
            rid = self.store.record("voice", result, pid)
            return {"voice_id": rid}, self.store.get(rid)
        if stage == "timeline":
            result = self.plan(p, data, media)
            rid = self.store.record("timeline", result, pid)
            return {"timeline_id": rid}, self.store.get(rid)
        if stage == "render":
            require(not data, "RENDER_PAYLOAD_FORBIDDEN", "Renderer uses the stored manifest only")
            timeline = self.current(p, "timeline_id", "timeline")
            self.validate_manifest(timeline["data"], p)
            result = media.render(timeline["data"], work)
            self.validate_manifest(timeline["data"], p)
            result.update({"timeline_id": timeline["id"], "timeline_hash": timeline["hash"]})
            rid = self.store.record("render", result, pid)
            return {"render_id": rid}, self.store.get(rid)
        if stage == "review":
            subject = self.store.get(data["subject_id"])
            require(subject["project_id"] == pid, "WRONG_PROJECT", "Review subject belongs to another project")
            kind = subject["kind"]
            require(kind in {"script", "render"} and p["state"].get(f"{kind}_id") == subject["id"], "STALE_REVIEW", "Review the current exact artifact")
            if data["verdict"] == "pass":
                keys = ["facts", "product", "visual"] + (["audio", "captions"] if kind == "render" else [])
                require(all(data[k] for k in keys), "REVIEW_CONFLICT", "A pass cannot contain failed checks")
            data.update({"subject_hash": subject["hash"], "evidence_type": "operator-attested-review"})
            rid = self.store.record("review", data, pid)
            changes = {f"{kind}_review_id": rid}
            if kind == "render" and data["verdict"] == "pass":
                timeline = self.current(p, "timeline_id", "timeline")
                self.validate_manifest(timeline["data"], p)
                result = self.export(p, subject, timeline, rid, work)
                changes["export_id"] = self.store.record("export", result, pid)
            if kind == "render" and data["verdict"] != "pass":
                changes["export_id"] = None
            if kind == "script" and data["verdict"] != "pass":
                changes.update({k: None for k in ["voice_id", "timeline_id", "render_id", "render_review_id", "export_id"]})
            return changes, self.store.get(rid)
        raise Gate("UNKNOWN_STAGE", "Unknown stage")

    def usable_asset(self, asset_id, project_id):
        a = self.store.get(asset_id, "asset")
        require(a["project_id"] == project_id and not self.store.revoked(asset_id), "ASSET_UNAVAILABLE", "Source is revoked or unavailable")
        self.receipts(a["data"]["rights"]["receipt_ids"], project_id)
        for key in ["original_blob_id", "master_blob_id", "proxy_blob_id", "time_map_blob_id"]:
            self.store.blob(a["data"][key])
        return a

    def eligible_observation(self, shot_id, role, p):
        s = self.store.get(shot_id, "shot")
        require(s["project_id"] == p["id"], "WRONG_PROJECT", "Shot belongs to a different project")
        self.usable_asset(s["data"]["asset_id"], p["id"])
        obs = next((o for o in self.store.list("observation", p["id"]) if o["data"]["shot_id"] == shot_id), None)
        require(obs, "WAITING_EXACT_SHOT", "Observe this shot before using it")
        d = obs["data"]
        require(d["product_id"] == p["state"].get("product_id") and d["clear"] and not d["uncertain"], "NO_VALID_EXACT_SHOT", "Shot observation is stale, obstructed, or uncertain")
        self.receipts(d["attestation"]["receipt_ids"], p["id"])
        for fid in d["frame_ids"]:
            self.store.blob(fid)
        require(d["usage_role"] == role, "ROLE_MISMATCH", "B-roll cannot prove product effects")
        if role == "EXACT_PRODUCT":
            require(d["product_match"] == "same_model_same_variant", "PRODUCT_MISMATCH", "Exact product evidence is required")
        return s, obs

    def script_approved(self, p):
        review = self.current(p, "script_review_id", "review")["data"]
        script = self.current(p, "script_id", "script")
        require(review["subject_id"] == script["id"] and review["subject_hash"] == script["hash"] and review["verdict"] == "pass", "SCRIPT_NOT_APPROVED", "Current script and title need review")
        self.receipts(review["attestation"]["receipt_ids"], p["id"])

    def plan(self, p, request, media):
        script = self.current(p, "script_id", "script")
        product = self.current(p, "product_id", "product")
        require(script["data"]["product_id"] == product["id"], "STALE_SCRIPT", "Product changed")
        locked = request["lock"]
        voice = None
        if locked:
            self.script_approved(p)
            voice = self.current(p, "voice_id", "voice")
            require(voice["data"]["script_id"] == script["id"], "STALE_VOICE", "Narration belongs to an older script")
            self.store.blob(voice["data"]["blob_id"])
        beats = script["data"]["beats"]
        require(set(request["layouts"]) <= {b["id"] for b in beats}, "UNKNOWN_BEAT", "Unknown layout beat")
        lengths = [b["end_frame"] - b["start_frame"] for b in voice["data"]["boundaries"]] if voice else [b["estimated_frames"] for b in beats]
        beam = [(0, [], {})]
        cursor = 0
        for beat, length in zip(beats, lengths):
            candidates = []
            for sid in beat["shot_ids"]:
                shot, obs = self.eligible_observation(sid, beat["usage_role"], p)
                s, o = shot["data"], obs["data"]
                if o["end_frame"] - o["start_frame"] > length or s["end_frame"] - s["start_frame"] < length:
                    continue
                end = min(s["end_frame"], max(o["end_frame"], o["start_frame"] + length))
                start = end - length
                if start < s["start_frame"] or start > o["start_frame"]:
                    continue
                asset = self.store.get(s["asset_id"], "asset")
                layout = request["layouts"].get(beat["id"], Crop().model_dump())
                if layout["mode"] == "crop":
                    require(layout["width"] > 0 and layout["height"] > 0 and layout["x"] + layout["width"] <= asset["data"]["width"] and
                            layout["y"] + layout["height"] <= asset["data"]["height"] and all(layout[k] % 2 == 0 for k in ["x", "y", "width", "height"]), "CROP_BOUNDS", "Crop must be even and inside the oriented master")
                candidates.append({"beat_id": beat["id"], "shot_id": sid, "observation_id": obs["id"], "asset_id": asset["id"],
                                   "asset_hash": asset["hash"], "master_blob_id": asset["data"]["master_blob_id"], "source_start_frame": start,
                                   "source_end_frame": end, "start_frame": cursor, "end_frame": cursor + length, "layout": layout,
                                   "speed": 1, "usage_role": beat["usage_role"]})
            expanded = []
            for score, clips, used in beam:
                for c in candidates:
                    # Same source is monotonic and cannot overlap/replay an action.
                    if used.get(c["asset_id"], -1) > c["source_start_frame"]:
                        continue
                    expanded.append((score + (1 if c["asset_id"] not in used else 0), [*clips, c], {**used, c["asset_id"]: c["source_end_frame"]}))
            beam = sorted(expanded, key=lambda x: x[0], reverse=True)[:20]
            require(beam, "TIMELINE_UNSATISFIABLE", f"Beat {beat['id']} lacks a continuous {length / 30:.2f}s shot including the whole action")
            cursor += length
        result = {"schema": "shopping-render-manifest-v2", "mode": p["state"]["mode"], "locked": locked, "fps": 30, "sample_rate": 48000,
                  "width": 1080, "height": 1920, "script_id": script["id"], "product_id": product["id"], "title": script["data"]["title"],
                  "voice_id": voice["id"] if voice else None, "voice_blob_id": voice["data"]["blob_id"] if voice else None,
                  "font_blob_id": media.font(), "clips": beam[0][1], "total_frames": cursor, "total_samples": cursor * 1600,
                  "captions": [{"start_frame": c["start_frame"], "end_frame": c["end_frame"], "text": b["caption_text"]} for b, c in zip(beats, beam[0][1])],
                  "audio_tracks": [{"role": "voice", "blob_id": voice["data"]["blob_id"], "source_start_sample": 0,
                                    "source_end_sample": cursor * 1600, "timeline_start_sample": 0, "gain_db": 0}] if voice else [],
                  "original_audio_included": False, "publication_authorized": False}
        for placement in request.get("sfx", []):
            require(locked, "SFX_REQUIRES_LOCK", "Place sound effects after voice timing is measured")
            sound = self.usable_sound(placement["sound_id"], p["id"])
            clip = next((c for c in result["clips"] if c["beat_id"] == placement["beat_id"]), None)
            require(clip, "UNKNOWN_BEAT", "Sound effect refers to an unknown beat")
            at = clip["start_frame"] * 1600 + placement["offset_samples"]
            samples = sound["data"]["sample_count"]
            require(at < clip["end_frame"] * 1600 and at + samples <= result["total_samples"], "SFX_RANGE", "Effect must start within its beat and end inside the video")
            require(placement["fade_in_samples"] + placement["fade_out_samples"] <= samples, "SFX_RANGE", "Effect fades overlap")
            result["audio_tracks"].append({"role": "sfx", "sound_id": sound["id"], "blob_id": sound["data"]["blob_id"],
                "source_start_sample": 0, "source_end_sample": samples, "timeline_start_sample": at, "gain_db": placement["gain_db"],
                "fade_in_samples": placement["fade_in_samples"], "fade_out_samples": placement["fade_out_samples"]})
        return RenderManifest.model_validate(result).model_dump(mode="json", by_alias=True)

    def usable_sound(self, sound_id, project_id):
        sound = self.store.get(sound_id, "sound")
        require(sound["project_id"] == project_id and not self.store.revoked(sound_id), "SOUND_UNAVAILABLE", "Sound is unavailable")
        self.receipts(sound["data"]["rights"]["receipt_ids"], project_id)
        self.store.blob(sound["data"]["original_blob_id"])
        self.store.blob(sound["data"]["blob_id"])
        return sound

    def validate_manifest(self, m, p):
        RenderManifest.model_validate(m)
        require(m["schema"] == "shopping-render-manifest-v2" and m["locked"], "TIMELINE_NOT_LOCKED", "Only a locked shopping manifest can render")
        require(m["script_id"] == p["state"].get("script_id") and m["product_id"] == p["state"].get("product_id") and m["voice_id"] == p["state"].get("voice_id"), "STALE_MANIFEST", "Manifest dependencies changed")
        self.script_approved(p)
        voice = self.store.get(m["voice_id"], "voice")["data"]
        self.receipts(voice["attestation"]["receipt_ids"], p["id"])
        require(voice["sample_count"] == m["total_samples"] == m["total_frames"] * 1600, "AUDIO_TIMING", "Voice samples do not match picture frames")
        script = self.store.get(m["script_id"], "script")["data"]
        claims = self.store.get(m["product_id"], "product")["data"]["claims"]
        used_claims = {cid for b in script["beats"] for cid in b["claim_ids"]}
        for claim in claims:
            if claim["id"] in used_claims:
                self.receipts(claim["receipt_ids"], p["id"])
                require(not claim["expires_at"] or datetime.fromisoformat(claim["expires_at"]) > datetime.now(timezone.utc), "CLAIM_EXPIRED", "A used claim expired")
        cursor, used = 0, {}
        require([c["beat_id"] for c in m["clips"]] == [b["id"] for b in script["beats"]], "BEAT_ORDER", "Timeline must cover each beat once")
        for clip in m["clips"]:
            shot, obs = self.eligible_observation(clip["shot_id"], clip["usage_role"], p)
            require(obs["id"] == clip["observation_id"], "STALE_OBSERVATION", "Rebuild after a shot observation changes")
            asset = self.usable_asset(clip["asset_id"], p["id"])
            require(asset["hash"] == clip["asset_hash"] and asset["data"]["master_blob_id"] == clip["master_blob_id"], "ASSET_DRIFT", "Manifest source changed")
            require(clip["start_frame"] == cursor and clip["end_frame"] > cursor and clip["speed"] == 1 and
                    clip["end_frame"] - cursor == clip["source_end_frame"] - clip["source_start_frame"], "TIMELINE_GAP", "Timeline contains a gap or speed change")
            require(shot["data"]["start_frame"] <= clip["source_start_frame"] <= obs["data"]["start_frame"] < obs["data"]["end_frame"] <= clip["source_end_frame"] <= shot["data"]["end_frame"], "ACTION_TRIMMED", "Cut must contain the complete observed action")
            require(used.get(asset["id"], -1) <= clip["source_start_frame"], "REUSED_INTERVAL", "Source repeats or reverses")
            used[asset["id"]] = clip["source_end_frame"]
            cursor = clip["end_frame"]
        require(cursor == m["total_frames"], "TIMELINE_DURATION", "Frame count mismatch")
        self.store.blob(m["font_blob_id"])
        self.store.blob(m["voice_blob_id"])
        require(m["audio_tracks"] and m["audio_tracks"][0]["role"] == "voice" and m["audio_tracks"][0]["blob_id"] == m["voice_blob_id"], "VOICE_TRACK_MISSING", "Voice track binding is required")
        for track in m["audio_tracks"]:
            length = track["source_end_sample"] - track["source_start_sample"]
            require(length > 0 and track["timeline_start_sample"] + length <= m["total_samples"], "AUDIO_RANGE", "Audio lies outside locked duration")
            if track["role"] == "sfx":
                sound = self.usable_sound(track["sound_id"], p["id"])
                require(sound["data"]["blob_id"] == track["blob_id"] and track["source_end_sample"] <= sound["data"]["sample_count"], "AUDIO_RANGE", "Effect source binding changed")

    def search(self, p, query, role, round_number=0):
        require(0 <= round_number <= 2, "SEARCH_ROUND_LIMIT", "At most two search expansions are allowed")
        terms = query.casefold().split()
        candidates = []
        for shot in self.store.list("shot", p["id"]):
            try:
                _, obs = self.eligible_observation(shot["id"], role, p)
            except Gate:
                continue
            text = (obs["data"]["description"] + " " + obs["data"]["action"]).casefold()
            score = sum(term in text for term in terms)
            if score or not terms:
                candidates.append({"shot_id": shot["id"], "observation_id": obs["id"], "matches": score, "observation": obs["data"]})
        candidates.sort(key=lambda c: c["matches"], reverse=True)
        return {"provider": "luna-observation-text-index-v1", "status": "READY" if candidates else "WAITING_EXACT_SHOT",
                "round": round_number, "candidates": candidates[:3], "score_is_probability": False}

    def export(self, p, render, timeline, review_id, work):
        source_manifest, credit_lines = [], []
        for clip in timeline["data"]["clips"]:
            asset = self.usable_asset(clip["asset_id"], p["id"])
            r = asset["data"]["rights"]
            source_manifest.append({"asset_id": asset["id"], "asset_hash": asset["hash"], "rights": r,
                                    "source_start_frame": clip["source_start_frame"], "source_end_frame": clip["source_end_frame"],
                                    "transform": clip["layout"], "original_blob": self.store.get(asset["data"]["original_blob_id"], "blob")["data"]})
            credit_lines.append(f"{r['author']} | {r['source_url']} | {r['license']} {r['license_url']} | frames {clip['source_start_frame']}..{clip['source_end_frame']} | crop/scale/captions, source audio removed")
        for track in timeline["data"]["audio_tracks"]:
            if track["role"] == "sfx":
                sound = self.usable_sound(track["sound_id"], p["id"])
                r = sound["data"]["rights"]
                source_manifest.append({"sound_id": sound["id"], "sound_hash": sound["hash"], "rights": r, "placement": track})
                credit_lines.append(f"SFX: {r['author']} | {r['source_url']} | {r['license']} {r['license_url']} | gain/fade/mix")
        bundle = work / "bundle"
        bundle.mkdir()
        shutil.copyfile(self.store.blob(render["data"]["video_blob_id"]), bundle / "final.mp4")
        shutil.copyfile(self.store.blob(render["data"]["srt_blob_id"]), bundle / "captions.srt")
        files = {"script.json": self.store.get(p["state"]["script_id"])["data"], "timeline.json": timeline["data"],
                 "source_manifest.json": source_manifest, "qa_report.json": {"technical": render["data"], "semantic_review": self.store.get(review_id),
                 "evidence_level": "synthetic-integration-test" if p["state"]["mode"] == "synthetic-test" else "operator-attested", "publication_authorized": False}}
        for name, data in files.items():
            (bundle / name).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        (bundle / "credits.txt").write_text("\n".join(credit_lines), encoding="utf-8")
        checksums = {f.name: self.store.file_hash(f) for f in bundle.iterdir()}
        (bundle / "SHA256SUMS.json").write_text(json.dumps(checksums, indent=2), encoding="utf-8")
        target = work / "shopping-shorts.zip"
        with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
            for f in bundle.iterdir():
                z.write(f, f.name)
        return {"blob_id": self.store.put_file(target), "render_id": render["id"], "review_id": review_id,
                "checksums": checksums, "mode": p["state"]["mode"], "publication_authorized": False}
