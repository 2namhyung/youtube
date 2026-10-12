import json
import os
import secrets
import shutil
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlsplit
from fastapi import FastAPI, Request, UploadFile, File, Header
from fastapi.responses import JSONResponse, FileResponse
from pydantic import ValidationError
from apps.api.store import Store, Gate, require, now, uid, canonical, digest, physical
from apps.api.pipeline import Pipeline, STAGES
from packages.contracts.models import ProjectCreate, StageRequest, Receipt, Completion, STAGE_MODELS, VERSION, RenderManifest, YouTubeDiscoveryRequest
from packages.providers.luna import packet
from workers.discovery.youtube import collect as collect_youtube, PROVIDER as YOUTUBE_PROVIDER
from packages.contracts.story_discovery import StoryCollectionRequest, StoryEvidence, StoryTopicReview, StorySelection, NarrativeIntake, NarrativeIntakeBatch, StoryChannelObservation
from workers.discovery.story_intake import submit_intake, submit_intake_batch
from workers.discovery.story_topics import collect_topics, dashboard as story_dashboard, review_packet as story_packet, register_evidence, submit_review, write_report, latest_records, evaluate_topic, register_channel_observation
from scripts.discover_shopping_channels import YouTube

ROOT = Path(__file__).resolve().parents[2]


def create_app(data_root=None, start_worker=True):
    store = Store(data_root or os.environ.get("SHOPPING_DATA_DIR", ROOT / "data"))
    pipeline = Pipeline(store)
    csrf = secrets.token_urlsafe(32)

    @asynccontextmanager
    async def lifespan(app):
        if start_worker:
            pipeline.start()
        yield
        pipeline.close()
        store.close()

    app = FastAPI(title="Shopping Shorts · Luna Studio", version=VERSION, lifespan=lifespan)
    app.state.store, app.state.pipeline, app.state.csrf = store, pipeline, csrf

    @app.middleware("http")
    async def local_boundary(request: Request, call_next):
        host = request.headers.get("host", "").split(":")[0]
        if host not in {"localhost", "127.0.0.1", "testserver"}:
            return JSONResponse({"code": "HOST_DENIED"}, status_code=403)
        origin = request.headers.get("origin")
        if origin and urlsplit(origin).netloc != request.headers.get("host"):
            return JSONResponse({"code": "ORIGIN_DENIED"}, status_code=403)
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            if not secrets.compare_digest(request.headers.get("x-studio-token", ""), csrf):
                return JSONResponse({"code": "SESSION_TOKEN_REQUIRED"}, status_code=403)
            if not request.headers.get("idempotency-key"):
                return JSONResponse({"code": "IDEMPOTENCY_REQUIRED"}, status_code=400)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
        return response

    @app.exception_handler(Gate)
    async def gate_error(request, exc):
        return JSONResponse({"code": exc.code, "message": exc.message}, status_code=exc.status)

    @app.exception_handler(ValidationError)
    async def validation_error(request, exc):
        return JSONResponse({"code": "INVALID_INPUT", "message": str(exc)}, status_code=422)

    def mutation(scope, key, body, action):
        request_hash = digest(body)
        with store.lock:
            existing = store.rows("SELECT * FROM idempotency WHERE scope=? AND key=?", (scope, key))
            if existing:
                require(existing[0]["request_hash"] == request_hash, "IDEMPOTENCY_CONFLICT", "Same key has different content", 409)
                return json.loads(existing[0]["response_json"])
            result = action()
            with store.transaction() as db:
                db.execute("INSERT INTO idempotency VALUES(?,?,?,?)", (scope, key, request_hash, canonical(result)))
            return result

    @app.get("/v1/session")
    def session():
        return {"token": csrf, "version": VERSION, "profile": "local-single-operator", "default_model": "gpt-5.6-luna"}

    @app.get("/v1/capabilities")
    def capabilities():
        checked = now()
        def cap(name, status, scope, evidence):
            return {"name": name, "status": status, "scope": scope, "evidence": evidence, "checked_at": checked}
        ffmpeg = shutil.which(os.environ.get("SHOPPING_FFMPEG", "ffmpeg"))
        ffprobe = shutil.which(os.environ.get("SHOPPING_FFPROBE", "ffprobe"))
        youtube_key = bool(os.environ.get("YOUTUBE_API_KEY"))
        return {"profile": "luna-browser-local-v1", "required_external_api_keys": [], "optional_external_api_keys": ["YOUTUBE_API_KEY"], "capabilities": [
            cap("luna_operator_bridge", "READY", "현재 Codex 작업의 JSON·근거 제출", "서버 계약 사용 가능. 실제 사용 모델은 제출 attestation에 기록"),
            cap("chrome_computer_use", "NOT_CONFIGURED", "현재 Codex 작업의 연결된 브라우저·Windows 도구", "앱 서버는 Codex 도구 연결 여부를 추정하지 않음"),
            cap("local_media", "READY" if ffmpeg and ffprobe else "NOT_CONFIGURED", "원본 정규화·샷·프레임·30fps 렌더", "FFmpeg/ffprobe executable detected" if ffmpeg and ffprobe else "Install FFmpeg and ffprobe"),
            cap("local_shot_search", "READY", "Luna가 관측한 샷의 설명 검색", "관측 근거가 없는 샷은 제외"),
            cap("uploaded_voice", "READY", "승인된 beat별 음성, 48kHz 실측", "외부 TTS API 불필요"),
            cap("youtube_data_api", "READY" if youtube_key else "NOT_CONFIGURED", "1단계 공개 영상 검색·채널 코호트·조회수 스냅샷", "YOUTUBE_API_KEY detected" if youtube_key else "Set YOUTUBE_API_KEY; api.txt is never read"),
            cap("youtube_derived_analytics", "READY" if youtube_key else "BLOCKED_PREREQUISITE", "API 관측 시점별 24/72/168시간 코호트 계산", "현재 누적값을 과거 스냅샷으로 대체하지 않음"),
            cap("jev", "DISABLED_UNVERIFIED", "Luna 기본 경로 이후의 선택 의미 재검수", "기본 실행에서 호출하지 않음"),
            cap("wise", "DISABLED_UNVERIFIED", "선택적 대규모 검색", "기본 경로는 로컬 프레임+Luna 관측; 실제 WISE 설치 미검증"),
            cap("azure_speech", "NOT_CONFIGURED", "선택적 음성 합성", "기본 경로는 승인 음성 업로드"),
            cap("coupang_api", "DISABLED_UNVERIFIED", "계정 계약 확인 후 확장", "기본 경로는 페이지 관측+상품 근거"),
        ], "cost_estimate": None, "publication_enabled": False}

    @app.get("/v1/contracts")
    def contracts():
        return {name: model.model_json_schema() for name, model in {**STAGE_MODELS, "youtube-discovery": YouTubeDiscoveryRequest, "render-manifest-v2": RenderManifest, "story-topic": StoryTopicReview, "story-evidence": StoryEvidence, "narrative-intake": NarrativeIntake}.items()}

    @app.get("/v1/story-discovery")
    def story_topics():
        return story_dashboard(store)

    @app.get("/v1/story-discovery/packet")
    def story_operator_packet():
        return story_packet(store)

    @app.get("/v1/story-discovery/planning-report")
    def story_planning_report():
        path = physical(store.root / "reports/story-discovery/planning-briefs.md", store.root)
        require(path.is_file(), "REPORT_NOT_READY", "No planning report has been generated", 404)
        return FileResponse(path, media_type="text/markdown; charset=utf-8", filename="stage-1-planning-briefs.md")

    @app.post("/v1/story-discovery/collect")
    def story_collect(body: StoryCollectionRequest, idempotency_key: str = Header()):
        def action():
            key = os.environ.get("YOUTUBE_API_KEY", "")
            require(key, "YOUTUBE_API_KEY_MISSING", "YOUTUBE_API_KEY is not configured", 503)
            api = YouTube.from_environment(body.read_budget, body.search_budget, body.stats_budget,
                                           state_path=store.root / "youtube-cooldowns.json")
            try:
                result = collect_topics(store, api, body)
                write_report(store)
                return result
            finally:
                api.close()
        return mutation("story-collect", idempotency_key, body.model_dump(), action)

    @app.post("/v1/story-discovery/evidence", status_code=201)
    def story_evidence(body: StoryEvidence, idempotency_key: str = Header()):
        return mutation("story-evidence", idempotency_key, body.model_dump(mode="json"), lambda: register_evidence(store, body))

    @app.post("/v1/story-discovery/reviews", status_code=201)
    def story_review(body: StoryTopicReview, idempotency_key: str = Header()):
        def action():
            result = submit_review(store, body)
            write_report(store)
            return result
        return mutation("story-review", idempotency_key, body.model_dump(mode="json"), action)

    @app.post("/v1/story-discovery/intakes", status_code=201)
    def narrative_intake(body: NarrativeIntake, idempotency_key: str = Header()):
        def action():
            result = submit_intake(store, body)
            write_report(store)
            return result
        return mutation("story-intake", idempotency_key, body.model_dump(mode="json"), action)

    @app.get("/v1/story-discovery/credentials")
    def story_credentials():
        keys = [os.environ.get(name, "") for name in ("YOUTUBE_API_KEY", "YOUTUBE_API_KEY_2")]
        if any(keys):
            with YouTube.from_environment(0, 0, 0, state_path=store.root / "youtube-cooldowns.json") as api:
                return api.credential_status()
        return {"configured": len(set(k for k in keys if k)), "failover": "invalid_or_expired_credential_only",
                "quota_rotation": False, "cooldowns": {}}

    @app.post("/v1/story-discovery/intake-batches", status_code=201)
    def narrative_batch(body: NarrativeIntakeBatch, idempotency_key: str = Header()):
        def action():
            result = submit_intake_batch(store, body)
            write_report(store)
            return result
        return mutation("story-intake-batch", idempotency_key, body.model_dump(mode="json"), action)

    @app.post("/v1/story-discovery/channel-observations", status_code=201)
    def story_channel_observation(body: StoryChannelObservation, idempotency_key: str = Header()):
        def action():
            result = register_channel_observation(store, body)
            write_report(store)
            return result
        return mutation("story-channel-observation", idempotency_key, body.model_dump(mode="json"), action)

    @app.post("/v1/projects/{project_id}/story-opportunity")
    def choose_story(project_id: str, body: StorySelection, idempotency_key: str = Header()):
        def action():
            project = store.check_revision(project_id, body.expected_revision)
            reviews = latest_records(store, "story-review", "topic_id")
            require(body.topic_id in reviews, "TOPIC_NOT_FOUND", "Topic not found", 404)
            result = evaluate_topic(store, StoryTopicReview.model_validate(reviews[body.topic_id]["data"]))
            require(result["status"] == "ready_for_product_research", "TOPIC_NOT_READY", "이야기·트렌드·상품 연결과 채널 활동 검증을 완료하세요.")
            require(not project["state"].get("product_id") and not project["state"].get("script_id"),
                    "PROJECT_ALREADY_STARTED", "Use a new project for a new story topic", 409)
            with store.transaction() as db:
                require(not db.execute("SELECT id FROM jobs WHERE project_id=? AND state IN ('QUEUED','RUNNING','WAITING_INPUT')", (project_id,)).fetchone(),
                        "PROJECT_BUSY", "Finish or cancel the pending stage before changing the topic", 409)
                rid = store.record("story-selection", result, project_id, db)
                state = {**project["state"], "story_topic_id": rid}
                changed = db.execute("UPDATE projects SET json=?,revision=revision+1 WHERE id=? AND revision=?",
                                     (canonical(state), project_id, project["revision"]))
                require(changed.rowcount == 1, "REVISION_CONFLICT", "Project changed", 409)
            return store.project(project_id)
        return mutation(f"story-select:{project_id}", idempotency_key, body.model_dump(), action)

    @app.get("/v1/shopping-channel-audit-queue")
    def shopping_channel_audit_queue():
        """Expose the generated local queue to Luna/Chrome without file access."""
        path = ROOT / "data" / "reports" / "shopping-channel-classification" / "browser-queue.json"
        require(path.is_file(), "AUDIT_QUEUE_NOT_FOUND", "Generate the shopping channel classification queue first", 404)
        document = json.loads(path.read_text(encoding="utf-8"))
        channels = document.get("channels", [])
        require(isinstance(channels, list), "INVALID_AUDIT_QUEUE", "Audit queue must contain a channels list", 500)
        return {"schema": "shopping-channel-browser-queue-v1", "count": len(channels), "channels": channels}

    @app.get("/v1/projects")
    def projects():
        return [store.project(r["id"]) for r in store.rows("SELECT id FROM projects ORDER BY created_at DESC")]

    @app.post("/v1/projects", status_code=201)
    def create_project(body: ProjectCreate, idempotency_key: str = Header()):
        def action():
            pid = uid("project")
            state = {"desired_seconds": body.desired_seconds, "mode": body.mode, "asset_ids": [], "publication_authorized": False}
            with store.transaction() as db:
                db.execute("INSERT INTO projects VALUES(?,?,?,?,?)", (pid, body.name, 1, canonical(state), now()))
            return store.project(pid)
        return mutation("projects", idempotency_key, body.model_dump(), action)

    @app.get("/v1/projects/{project_id}")
    def project(project_id: str):
        return pipeline.context(project_id)

    @app.post("/v1/projects/{project_id}/stages/{stage}", status_code=202)
    def stage(project_id: str, stage: str, body: StageRequest, idempotency_key: str = Header()):
        return pipeline.enqueue(project_id, stage, body.model_dump(), idempotency_key)

    @app.post("/v1/projects/{project_id}/scripts", status_code=202)
    @app.post("/v1/projects/{project_id}/timeline", status_code=202)
    @app.post("/v1/projects/{project_id}/voice", status_code=202)
    @app.post("/v1/projects/{project_id}/render", status_code=202)
    def action_alias(project_id: str, request: Request, body: StageRequest, idempotency_key: str = Header()):
        action_name = request.url.path.rsplit("/", 1)[-1]
        aliases = {"scripts": "script", "timeline": "timeline", "voice": "voice", "render": "render"}
        require(action_name in aliases, "NOT_FOUND", "Unknown action", 404)
        return pipeline.enqueue(project_id, aliases[action_name], body.model_dump(), idempotency_key)

    @app.post("/v1/discovery-runs", status_code=202)
    @app.post("/v1/products/resolve", status_code=202)
    @app.post("/v1/library/ingestions", status_code=202)
    def global_stage(request: Request, body: dict, idempotency_key: str = Header()):
        require(set(body) == {"project_id", "expected_revision", "payload"}, "INVALID_INPUT", "project_id, expected_revision, payload required")
        stages = {"/v1/discovery-runs": "discovery", "/v1/products/resolve": "product", "/v1/library/ingestions": "ingest"}
        req = StageRequest.model_validate({k: v for k, v in body.items() if k != "project_id"})
        return pipeline.enqueue(body["project_id"], stages[request.url.path], req.model_dump(), idempotency_key)

    @app.post("/v1/projects/{project_id}/youtube-discovery", status_code=202)
    def youtube_discovery(project_id: str, body: YouTubeDiscoveryRequest, idempotency_key: str = Header()):
        project = store.check_revision(project_id, body.expected_revision)
        require(project["state"]["mode"] == "production", "SYNTHETIC_EVIDENCE", "YouTube API discovery is for production projects")
        collection = collect_youtube(os.environ.get("YOUTUBE_API_KEY", ""), body,
                                     backup_key=os.environ.get("YOUTUBE_API_KEY_2", ""), state_path=store.root / "youtube-cooldowns.json")
        evidence_path = physical(store.root / "work" / f"{uid('youtube')}.json", store.root)
        try:
            evidence_path.write_text(canonical(collection["evidence"]), encoding="utf-8")
            blob_id = store.put_file(evidence_path, "youtube-discovery.json")
        finally:
            evidence_path.unlink(missing_ok=True)
        receipt_data = {
            "blob_id": blob_id,
            "url": f"https://www.youtube.com/watch?v={collection['candidate_id']}",
            "observed_at": collection["observed_at"],
            "surface": "youtube-data-api",
            "note": f"YouTube Data API v3 public statistics; query={body.query}; channel={collection['channel_id']}",
        }
        receipt_id = store.record("receipt", receipt_data, project_id)
        current = []
        for snapshot in collection["snapshots"]:
            data = {k: v for k, v in snapshot.items() if k not in {"title", "duration"}}
            data["receipt_id"] = receipt_id
            store.record("youtube-observation", data, project_id)
            current.append(data)
        authorization = {
            "project_id": project_id, "receipt_id": receipt_id, "providers": [YOUTUBE_PROVIDER],
            "statement": "Operator-requested YouTube Data API public-statistics collection for shopping discovery",
        }
        with store.transaction() as db:
            db.execute("INSERT OR REPLACE INTO settings VALUES(?,?)", (f"analytics_authorization:{project_id}", canonical(authorization)))
            store.record("authorization", authorization, project_id, db)
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        history = [item["data"] for item in store.list("youtube-observation", project_id)
                   if item["data"]["channel_id"] == collection["channel_id"] and item["data"]["provider"] == YOUTUBE_PROVIDER
                   and datetime.fromisoformat(item["data"]["observed_at"]) >= cutoff]
        unique = {}
        for snapshot in history:
            key = (snapshot["video_id"], snapshot["observed_at"], snapshot["provider"], snapshot["definition"])
            unique.setdefault(key, snapshot)
        snapshots = list(unique.values())[:2000]
        payload = {
            "candidate_id": collection["candidate_id"], "age_hours": body.age_hours, "snapshots": snapshots,
            "attestation": {"actor": "shopping-shorts-api", "model": "youtube-data-api-v3", "surface": "youtube-data-api",
                            "receipt_ids": [receipt_id], "notes": "Public metadata and statistics collected from the official API; Shorts and commerce semantics remain unconfirmed until separate observation."},
        }
        return pipeline.enqueue(project_id, "discovery", {"expected_revision": body.expected_revision, "payload": payload}, idempotency_key)

    @app.get("/v1/jobs")
    def jobs(project_id: str | None = None):
        query, args = (" WHERE project_id=?", [project_id]) if project_id else ("", [])
        return [pipeline.job(r["id"]) for r in store.rows("SELECT id FROM jobs" + query + " ORDER BY created_at DESC LIMIT 100", args)]

    @app.get("/v1/jobs/{job_id}")
    def job(job_id: str):
        return pipeline.job(job_id)

    @app.get("/v1/jobs/{job_id}/packet")
    def operator_packet(job_id: str):
        j = pipeline.job(job_id)
        return packet(j, pipeline.context(j["project_id"]))

    @app.post("/v1/jobs/{job_id}/inputs", status_code=202)
    def inputs(job_id: str, body: Completion, idempotency_key: str = Header()):
        return mutation(f"input:{job_id}", idempotency_key, body.model_dump(), lambda: pipeline.submit(job_id, body.model_dump()))

    @app.post("/v1/jobs/{job_id}/cancel")
    def cancel(job_id: str, idempotency_key: str = Header()):
        return mutation(f"cancel:{job_id}", idempotency_key, {}, lambda: pipeline.cancel(job_id))

    @app.post("/v1/uploads", status_code=201)
    async def upload(file: UploadFile = File(...), idempotency_key: str = Header()):
        name = Path((file.filename or "").replace("\\", "/")).name
        require(name.casefold() not in {"api.txt", "pixel.txt", ".env", "auth.json", "credentials.json"}, "SECRET_FILE_DENIED", "Secret files are not accepted")
        require(Path(name).suffix.lower() in {".mp4", ".mov", ".webm", ".mkv", ".wav", ".mp3", ".m4a", ".ogg", ".png", ".jpg", ".jpeg", ".txt", ".json", ".srt", ".pdf"}, "UPLOAD_TYPE_DENIED", "Unsupported upload type")
        target = physical(store.root / "work" / (uid("upload") + Path(name).suffix.lower()), store.root)
        total = 0
        try:
            with open(target, "xb") as out:
                while chunk := await file.read(1024 * 1024):
                    total += len(chunk)
                    require(total <= 512 * 1024 * 1024, "UPLOAD_TOO_LARGE", "Maximum upload is 512 MB", 413)
                    out.write(chunk)
            require(total > 0, "EMPTY_UPLOAD", "Empty files are not accepted")
            result = mutation("upload", idempotency_key, {"name": name, "sha": store.file_hash(target)}, lambda: store.get(store.put_file(target, name)))
            return result
        finally:
            target.unlink(missing_ok=True)
            await file.close()

    @app.post("/v1/projects/{project_id}/receipts", status_code=201)
    def receipt(project_id: str, body: Receipt, idempotency_key: str = Header()):
        p = store.project(project_id)
        require(body.surface != "fixture" or p["state"]["mode"] == "synthetic-test", "SYNTHETIC_EVIDENCE", "Fixture receipts are test-only")
        store.blob(body.blob_id)
        return mutation(f"receipt:{project_id}", idempotency_key, body.model_dump(mode="json"),
                        lambda: store.get(store.record("receipt", body.model_dump(mode="json"), project_id)))

    @app.get("/v1/files/{blob_id}")
    def file(blob_id: str, download: bool = False):
        record = store.get(blob_id, "blob")
        path = store.blob(blob_id)
        # Exports are revalidated on every download, including revocation after render.
        exports = [r for r in store.list("export") if r["data"]["blob_id"] == blob_id]
        for item in exports:
            p = store.project(item["project_id"])
            require(p["state"].get("export_id") == item["id"], "STALE_EXPORT", "A newer revision invalidated this export")
            pipeline.validate_manifest(pipeline.current(p, "timeline_id", "timeline")["data"], p)
            review = store.get(item["data"]["review_id"], "review")["data"]
            pipeline.receipts(review["attestation"]["receipt_ids"], p["id"])
        response = FileResponse(path, filename=record["data"]["name"] if download else None)
        if path.suffix.lower() in {".txt", ".json", ".srt", ".pdf"}:
            response.headers["Content-Disposition"] = 'attachment; filename="evidence' + path.suffix + '"'
        return response

    @app.get("/v1/assets/{asset_id}")
    def asset(asset_id: str):
        return store.get(asset_id, "asset")

    @app.get("/v1/outliers")
    def outliers(project_id: str | None = None):
        return store.list("outlier", project_id)

    @app.post("/v1/shots/search")
    def search(body: dict):
        require(set(body) <= {"project_id", "query", "usage_role", "round"}, "INVALID_INPUT", "Unknown search property")
        require(body.get("usage_role") in {"EXACT_PRODUCT", "STORY_BROLL", "GRAPHIC"}, "INVALID_INPUT", "Choose a usage role")
        require(isinstance(body.get("query"), str) and len(body["query"]) <= 500, "INVALID_INPUT", "Query too long")
        return pipeline.search(store.project(body["project_id"]), body["query"], body["usage_role"], body.get("round", 0))

    @app.post("/v1/revocations")
    def revoke(body: dict, idempotency_key: str = Header()):
        require(set(body) == {"subject_id", "reason"} and isinstance(body["reason"], str) and body["reason"].strip(), "INVALID_INPUT", "Subject ID and reason required")
        subject = store.get(body["subject_id"])
        require(subject["kind"] in {"asset", "receipt", "sound"}, "INVALID_INPUT", "Revoke an asset, sound, or receipt")
        def action():
            rid = uid("revocation")
            with store.transaction() as db:
                db.execute("INSERT INTO revocations VALUES(?,?,?,?)", (rid, body["subject_id"], body["reason"], now()))
            return {"id": rid, "status": "REVOKED", "existing_evidence_preserved": True}
        return mutation("revocation", idempotency_key, body, action)

    @app.post("/v1/analytics-authorization")
    def analytics(body: dict, idempotency_key: str = Header()):
        require(set(body) == {"project_id", "receipt_id", "providers", "statement"} and body["statement"] and isinstance(body["providers"], list) and body["providers"], "INVALID_INPUT", "Scoped provider authorization and receipt required")
        pipeline.receipts([body["receipt_id"]], body["project_id"])
        def action():
            with store.transaction() as db:
                db.execute("INSERT OR REPLACE INTO settings VALUES(?,?)", (f"analytics_authorization:{body['project_id']}", canonical(body)))
                store.record("authorization", body, body["project_id"], db)
            return {"status": "REGISTERED", "evidence_level": "operator-attested"}
        return mutation("analytics", idempotency_key, body, action)

    @app.get("/{web_path:path}")
    def web(web_path: str):
        dist = ROOT / "apps" / "web" / "dist"
        candidate = physical(dist / web_path, dist)
        if web_path.startswith("v1/"):
            raise Gate("NOT_FOUND", "Unknown endpoint", 404)
        if candidate.is_file():
            return FileResponse(candidate)
        require((dist / "index.html").exists(), "WEB_NOT_BUILT", "Run npm --prefix apps/web run build", 503)
        return FileResponse(dist / "index.html")

    return app
