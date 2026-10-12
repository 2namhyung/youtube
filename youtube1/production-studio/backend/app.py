from __future__ import annotations

import json
import os
import secrets
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Callable, Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .core import (LICENSES, PROFILES, ROLES, VERSION, VISUAL_MODES, StudioStore,
                   attribution, canonical, digest, export_bundle, now, probe_duration,
                   require, safe_json, split_units, uid, visual_intent, query_terms,
                   MAX_UPLOAD_BYTES, strict_bool, validate_upload)


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=160)
    profile: Literal["newsroom", "shopping"]
    script: str = Field(default="", max_length=200_000)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    script: str = Field(min_length=1, max_length=200_000)
    expected_revision: int = Field(ge=1)


class ShotRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    source_id: str | None = None
    in_seconds: float | None = Field(default=None, ge=0)
    out_seconds: float | None = Field(default=None, gt=0)
    visual_mode: Literal["real-2d", "2.5d", "3d", "source"]
    notes: str = Field(default="", max_length=4000)
    query: str | None = Field(default=None, max_length=500)


class ConformRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_revision: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=200_000)
    change_note: str = Field(min_length=1, max_length=4000)
    facts_confirmed: bool


def _allowed_origins() -> set[str]:
    configured = os.environ.get("STUDIO_ALLOWED_ORIGINS", "")
    defaults = {
        "http://localhost:5174", "http://127.0.0.1:5174",
        "http://localhost:8766", "http://127.0.0.1:8766",
        "https://production-studio-rnrwn1123.vercel.app",
    }
    return {item.strip().rstrip("/") for item in configured.split(",") if item.strip()} or defaults


def _host_is_loopback(value: str) -> bool:
    host = value.split(":", 1)[0].strip("[]").lower()
    return host in {"localhost", "127.0.0.1", "::1", "testserver"}


def _header_response(response: Response, origin: str | None) -> Response:
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Studio-Token, Idempotency-Key"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        response.headers["Vary"] = "Origin"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' blob: data:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'"
    return response


def create_app(data_root: str | Path | None = None, *, testing: bool = False, media_router: Any | None = None, include_media: bool = False) -> FastAPI:
    store = StudioStore(data_root)
    session_token = secrets.token_urlsafe(32)
    allowed_origins = _allowed_origins()
    app = FastAPI(title="Production Studio", version=VERSION)
    app.state.store = store
    app.state.session_token = session_token
    app.state.allowed_origins = allowed_origins
    app.state.media_router = media_router

    @app.middleware("http")
    async def boundary(request: Request, call_next: Callable):
        host = request.headers.get("host", "")
        if not _host_is_loopback(host):
            return _header_response(JSONResponse({"code": "HOST_DENIED"}, status_code=403), None)
        origin = request.headers.get("origin")
        if origin and origin.rstrip("/") not in allowed_origins:
            return _header_response(JSONResponse({"code": "ORIGIN_DENIED"}, status_code=403), None)
        if request.method == "OPTIONS":
            return _header_response(Response(status_code=204), origin)
        if request.method not in {"GET", "HEAD"}:
            if request.headers.get("x-studio-token", "") != session_token:
                return _header_response(JSONResponse({"code": "SESSION_TOKEN_REQUIRED"}, status_code=403), origin)
            if not request.headers.get("idempotency-key"):
                return _header_response(JSONResponse({"code": "IDEMPOTENCY_REQUIRED"}, status_code=400), origin)
        response = await call_next(request)
        return _header_response(response, origin)

    @app.exception_handler(ValidationError)
    async def pydantic_error(request: Request, exc: ValidationError):
        return JSONResponse({"code": "INVALID_INPUT", "message": str(exc)}, status_code=422)

    def mutate(scope: str, key: str, payload: Any, action: Callable[[], Any]) -> Any:
        request_hash = digest(payload)
        with store.lock:
            store.db.execute("BEGIN IMMEDIATE")
            try:
                existing = store.row("SELECT request_hash,response_json FROM idempotency WHERE scope=? AND idem_key=?", [scope, key])
                if existing:
                    require(existing["request_hash"] == request_hash, "IDEMPOTENCY_CONFLICT", "Same key has different content", 409)
                    store.db.commit()
                    return json.loads(existing["response_json"])
                result = action()
                store.db.execute("INSERT INTO idempotency VALUES(?,?,?,?)", (scope, key, request_hash, canonical(result)))
                store.db.commit()
                return result
            except Exception:
                store.db.rollback()
                raise

    def project_response(project_id: str) -> dict[str, Any]:
        return store.project(project_id)

    @app.get("/api/studio/health")
    def health():
        return {"status": "ok", "service": "production-studio", "version": VERSION, "profiles": sorted(PROFILES)}

    @app.get("/api/studio/session")
    def session():
        return {"token": session_token, "version": VERSION, "profile": "local-single-operator", "mutations_require": ["X-Studio-Token", "Idempotency-Key"]}

    @app.get("/api/studio/profiles")
    def profiles():
        return PROFILES

    @app.get("/api/studio/projects")
    def projects():
        return [project_response(row["id"]) for row in store.rows("SELECT id FROM projects ORDER BY created_at DESC")]

    @app.post("/api/studio/projects", status_code=201)
    def create_project(body: ProjectCreate, idempotency_key: str = Header(alias="Idempotency-Key")):
        def action():
            project_id = uid("project")
            timestamp = now()
            state = {"analysis": None, "shot_ids": [], "conform_ids": [], "downstream_invalidated": False,
                     "publication_authorized": False, "production_approval": False}
            store.db.execute("INSERT INTO projects VALUES(?,?,?,?,?,?,?,?)", (project_id, body.name, body.profile, 1, body.script, canonical(state), timestamp, timestamp))
            payload = {"operation": "create", "project_id": project_id, "revision": 1, "script": body.script, "state": state, "payload": body.model_dump()}
            store.db.execute("INSERT INTO project_revisions VALUES(?,?,?,?,?,?)", (project_id, 1, "create", canonical(payload), digest(payload), timestamp))
            return store.project(project_id)
        return mutate("projects", idempotency_key, body.model_dump(), action)

    @app.get("/api/studio/projects/{project_id}")
    def get_project(project_id: str):
        return project_response(project_id)

    @app.post("/api/studio/projects/{project_id}/analyze")
    def analyze(project_id: str, body: AnalyzeRequest, idempotency_key: str = Header(alias="Idempotency-Key")):
        def action():
            project = store.project(project_id)
            units = split_units(body.script)
            require(units, "EMPTY_SCRIPT", "Script must contain at least one sentence")
            require(len(units) <= 300, "SCRIPT_TOO_LONG", "A script may contain at most 300 visual units")
            row = store.row("SELECT revision FROM projects WHERE id=?", [project_id])
            require(row is not None and row["revision"] == body.expected_revision, "REVISION_CONFLICT", "Project changed; reload the latest revision", 409)
            next_revision = body.expected_revision + 1
            old_ids = project["state"].get("shot_ids", [])
            suffix = "" if not old_ids else f"-r{next_revision}"
            analysis_id = uid("analysis")
            analyzed = [{"id": f"unit-{i:03d}{suffix}", "text": text, "query": query_terms(text),
                         "required_visual_intent": visual_intent(text, project["profile"]),
                         "suggestion_status": "unverified", "facts_preserved": True} for i, text in enumerate(units, 1)]
            shot_ids = []
            timestamp = now()
            for i, unit in enumerate(analyzed, 1):
                shot_id = f"shot-{project_id}-{i:03d}{suffix}"
                shot_ids.append(shot_id)
                store.db.execute("INSERT INTO shots VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                 (shot_id, project_id, i, unit["id"], unit["text"], unit["query"], unit["required_visual_intent"], None, None, None, "source", "", "missing-source", next_revision, timestamp))
            analysis = {"id": analysis_id, "schema": "script-shot-analysis-v1", "input_script": body.script,
                        "input_script_sha256": digest(body.script), "units": analyzed, "suggestions_unverified": True,
                        "source_selection_required": True}
            state = {**project["state"], "analysis": analysis, "shot_ids": shot_ids,
                     "stale_analysis": False, "downstream_invalidated": True, "invalidated_artifacts": ["voice", "timeline", "render", "publication"]}
            payload = {"script": body.script, "analysis": analysis, "shot_ids": shot_ids}
            store.record_revision(project_id, body.expected_revision, "analyze", payload, script=body.script, state=state)
            return {"project": store.project(project_id), "analysis": analysis}
        return mutate(f"analyze:{project_id}", idempotency_key, body.model_dump(), action)

    @app.get("/api/studio/sources")
    def sources():
        return [store.source(row["id"]) for row in store.rows("SELECT id FROM sources ORDER BY created_at DESC")]

    @app.post("/api/studio/sources", status_code=201)
    async def create_source(request: Request, idempotency_key: str = Header(alias="Idempotency-Key")):
        uploaded: UploadFile | None = None
        content = b""
        is_multipart = "multipart/form-data" in request.headers.get("content-type", "")
        if is_multipart:
            form = await request.form()
            raw_metadata = form.get("metadata", "{}")
            metadata = json.loads(raw_metadata) if isinstance(raw_metadata, str) else raw_metadata
            if not metadata:
                metadata = {key: value for key, value in form.multi_items() if key != "file" and isinstance(value, str)}
            candidate = form.get("file")
            uploaded = candidate if candidate is not None and hasattr(candidate, "read") else None
        else:
            metadata = await request.json()
        metadata = metadata if isinstance(metadata, dict) else {}
        allowed_source_fields = {"title", "source_url", "creator", "license", "license_url", "rights_evidence", "rights_confirmed", "role", "allow_transform", "allow_imagegen", "allow_omni", "media_type", "context", "origin", "project_id", "expected_revision"}
        unknown_fields = sorted(set(metadata) - allowed_source_fields)
        if unknown_fields:
            raise HTTPException(422, detail={"code": "UNKNOWN_SOURCE_FIELD", "message": "Unsupported source metadata field: " + unknown_fields[0]})
        metadata = {key: value for key, value in metadata.items() if key not in {"project_id", "expected_revision"}}
        title = str(metadata.get("title") or (uploaded.filename if uploaded else "")).strip()
        require(title, "SOURCE_TITLE_REQUIRED", "Source title is required")
        license_name = str(metadata.get("license", "unknown"))
        if license_name.casefold() in {"cc by 4.0", "cc-by 4.0", "creative commons attribution", "creativecommons"}:
            license_name = "CC-BY"
        role = str(metadata.get("role", "broll"))
        require(license_name in LICENSES, "INVALID_LICENSE", "Unsupported license")
        require(role in ROLES, "INVALID_SOURCE_ROLE", "Unsupported source role")
        try:
            rights_confirmed = strict_bool(metadata.get("rights_confirmed"), "rights_confirmed", allow_text=is_multipart)
            allow_transform = strict_bool(metadata.get("allow_transform"), "allow_transform", allow_text=is_multipart)
            allow_imagegen = strict_bool(metadata.get("allow_imagegen"), "allow_imagegen", allow_text=is_multipart)
            allow_omni = strict_bool(metadata.get("allow_omni"), "allow_omni", allow_text=is_multipart)
        except ValueError as exc:
            raise HTTPException(422, detail={"code": "INVALID_BOOLEAN", "message": str(exc)}) from exc
        source_id = uid("source")
        if uploaded:
            chunks: list[bytes] = []
            total = 0
            while True:
                chunk = await uploaded.read(1024 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                require(total <= MAX_UPLOAD_BYTES, "UPLOAD_TOO_LARGE", "Source exceeds the upload limit", 413)
                chunks.append(chunk)
            content = b"".join(chunks)
            try:
                validate_upload(str(uploaded.filename or ""), str(uploaded.content_type or ""), content)
            except ValueError as exc:
                raise HTTPException(422, detail={"code": "UNSUPPORTED_UPLOAD", "message": str(exc)}) from exc
        payload = {**metadata, "title": title, "filename": uploaded.filename if uploaded else None, "sha256": digest(content) if uploaded else None}
        def action():
            relative_path = sha = None
            byte_size = 0
            duration = None
            media_type = str(metadata.get("media_type") or (uploaded.content_type if uploaded else ""))
            if uploaded:
                suffix = Path(uploaded.filename or "").suffix
                relative_path, byte_size, sha = store.put_source_bytes(source_id, content, suffix)
                duration = probe_duration(store.media_root / relative_path)
            timestamp = now()
            values = (source_id, title, str(metadata.get("source_url", "")), str(metadata.get("creator", "")), license_name,
                      str(metadata.get("license_url", "")), str(metadata.get("rights_evidence", "")), int(rights_confirmed), role,
                      int(allow_transform), int(allow_imagegen), int(allow_omni),
                      relative_path, sha, byte_size, media_type, duration, timestamp, canonical({k: v for k, v in metadata.items() if k not in {"title", "source_url", "creator", "license", "license_url", "rights_evidence", "rights_confirmed", "role", "allow_transform", "allow_imagegen", "allow_omni"}}))
            store.db.execute("INSERT INTO sources VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", values)
            return store.source(source_id)
        return mutate("sources", idempotency_key, payload, action)

    def current_shot(project_id: str, shot_id: str) -> dict[str, Any]:
        row = store.row("SELECT * FROM shots WHERE id=? AND project_id=?", [shot_id, project_id])
        require(row is not None, "SHOT_NOT_FOUND", "Shot not found", 404)
        project = store.project(project_id)
        require(shot_id in project["state"].get("shot_ids", []), "STALE_SHOT", "Shot is from an older analysis revision", 409)
        return dict(row)

    @app.post("/api/studio/projects/{project_id}/shots/{shot_id}")
    def attach_shot(project_id: str, shot_id: str, body: ShotRequest, idempotency_key: str = Header(alias="Idempotency-Key")):
        def action():
            project = store.project(project_id)
            shot = current_shot(project_id, shot_id)
            require(project["revision"] == body.expected_revision, "REVISION_CONFLICT", "Project changed; reload the latest revision", 409)
            source = store.recheck_source(body.source_id) if body.source_id else None
            if source and source["duration_seconds"] is not None and body.out_seconds is not None:
                require(body.out_seconds <= float(source["duration_seconds"]) + 0.01, "SHOT_OUT_OF_RANGE", "Shot end exceeds source duration")
            if body.in_seconds is not None and body.out_seconds is not None:
                require(body.out_seconds > body.in_seconds, "SHOT_INTERVAL_INVALID", "Shot out must be greater than shot in")
            next_revision = body.expected_revision + 1
            new_id = f"{shot_id}-r{next_revision}"
            status = "rights-attested-pending-review" if source and source["rights_confirmed"] else ("unverified" if source else "missing-source")
            timestamp = now()
            store.db.execute("INSERT INTO shots VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                             (new_id, project_id, shot["shot_number"], shot["sentence_id"], shot["text"], body.query if body.query is not None else shot["query"], shot["visual_intent"], body.source_id, body.in_seconds, body.out_seconds, body.visual_mode, body.notes, status, next_revision, timestamp))
            current_ids = [new_id if item == shot_id else item for item in project["state"].get("shot_ids", [])]
            state = {**project["state"], "shot_ids": current_ids, "downstream_invalidated": True, "invalidated_artifacts": ["storyboard", "voice", "timeline", "render", "publication"]}
            result = store.record_revision(project_id, body.expected_revision, "shot-attach", {"from_shot_id": shot_id, "shot_id": new_id, "source_id": body.source_id, "visual_mode": body.visual_mode}, state=state)
            return {"project": result, "shot": next(item for item in result["shots"] if item["id"] == new_id)}
        return mutate(f"shot:{project_id}:{shot_id}", idempotency_key, body.model_dump(), action)

    @app.post("/api/studio/projects/{project_id}/conform")
    def conform(project_id: str, body: ConformRequest, idempotency_key: str = Header(alias="Idempotency-Key")):
        def action():
            project = store.project(project_id)
            require(project["revision"] == body.expected_revision, "REVISION_CONFLICT", "Project changed; reload the latest revision", 409)
            require(project["script"] != body.text, "NO_CHANGE", "Conform text must change the current script")
            next_revision = body.expected_revision + 1
            conform_id = uid("conform")
            status = "operator-attested-pending-independent-factual-review"
            state = {**project["state"], "conform_ids": [*project["state"].get("conform_ids", []), conform_id], "stale_analysis": True, "downstream_invalidated": True,
                     "invalidated_artifacts": ["shots", "storyboard", "voice", "timeline", "render", "publication"],
                     "final_voice_authority_unchanged": True}
            result = store.record_revision(project_id, body.expected_revision, "script-conform", {"conform_id": conform_id, "before_sha256": digest(project["script"]), "after_sha256": digest(body.text), "facts_confirmed": body.facts_confirmed}, script=body.text, state=state)
            store.db.execute("INSERT INTO conforms VALUES(?,?,?,?,?,?,?,?,?)", (conform_id, project_id, next_revision, project["script"], body.text, body.change_note, int(body.facts_confirmed), status, now()))
            return {"project": store.project(project_id), "conform": {"id": conform_id, "revision": next_revision, "status": status, "operator_attested": body.facts_confirmed, "independent_factual_review": False}}
        return mutate(f"conform:{project_id}", idempotency_key, body.model_dump(), action)

    @app.get("/api/studio/projects/{project_id}/handoff")
    def handoff(project_id: str):
        project = store.project(project_id)
        current_ids = set(project["state"].get("shot_ids", []))
        shots = [shot for shot in project["shots"] if shot["id"] in current_ids]
        source_refs = []
        blockers = []
        if not project["script"]:
            blockers.append({"code": "SCRIPT_MISSING", "message": "Add a script before handoff"})
        if not project["state"].get("analysis"):
            blockers.append({"code": "ANALYSIS_MISSING", "message": "Analyze the script into shot needs"})
        if project["state"].get("stale_analysis"):
            blockers.append({"code": "ANALYSIS_STALE", "message": "Reanalyze the script after conform before handoff"})
        for shot in shots:
            if not shot.get("source_id"):
                blockers.append({"code": "SOURCE_MISSING", "shot_id": shot["id"], "message": "Select a source for this shot"})
                continue
            try:
                source = store.recheck_source(shot["source_id"])
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
                blockers.append({"code": detail.get("code", "SOURCE_UNAVAILABLE"), "shot_id": shot["id"], "source_id": shot["source_id"], "message": detail.get("message", "Source bytes are unavailable")})
                continue
            rights_ready = bool(source["rights_confirmed"] and source["original_sha256"] and source["license"] != "unknown")
            if source["license"] == "CC-BY" and not all(source.get(key) for key in ("creator", "source_url", "license_url", "rights_evidence")):
                rights_ready = False
                blockers.append({"code": "CC_BY_ATTRIBUTION_INCOMPLETE", "shot_id": shot["id"], "source_id": source["id"], "message": "CC-BY source needs creator, source URL, license URL and item-level rights evidence"})
            elif source["license"] != "owned" and not all(source.get(key) for key in ("source_url", "license_url", "rights_evidence")):
                rights_ready = False
                blockers.append({"code": "RIGHTS_EVIDENCE_INCOMPLETE", "shot_id": shot["id"], "source_id": source["id"], "message": "Source URL, license URL and item-level rights evidence are required"})
            elif source["license"] == "owned" and not source.get("rights_evidence"):
                rights_ready = False
                blockers.append({"code": "OWNED_RIGHTS_EVIDENCE_MISSING", "shot_id": shot["id"], "source_id": source["id"], "message": "Record the ownership or permission evidence"})
            if not source["original_sha256"]:
                blockers.append({"code": "SOURCE_BYTES_MISSING", "shot_id": shot["id"], "source_id": source["id"], "message": "Register the actual original bytes before handoff"})
            if not rights_ready:
                blockers.append({"code": "RIGHTS_NOT_READY", "shot_id": shot["id"], "source_id": source["id"], "message": "Item-level rights confirmation is incomplete"})
            source_refs.append({"source_id": source["id"], "sha256": source["original_sha256"], "byte_size": source["byte_size"], "media_type": source["media_type"], "duration_seconds": source["duration_seconds"], "role": source["role"], "origin": source.get("origin", "unspecified"), "license": source["license"], "title": source["title"], "creator": source["creator"], "source_url": source["source_url"], "license_url": source["license_url"], "rights_evidence": source["rights_evidence"], "rights_confirmed": source["rights_confirmed"], "allow_transform": source["allow_transform"], "allow_imagegen": source["allow_imagegen"], "allow_omni": source["allow_omni"], "rights_ready": rights_ready, "evidence_reviewed": False})
            if source["role"] == "evidence":
                if source.get("origin") != "actual-case-evidence":
                    blockers.append({"code": "EVIDENCE_ORIGIN_UNVERIFIED", "shot_id": shot["id"], "source_id": source["id"], "message": "Evidence sources need explicit actual-case-evidence origin"})
                else:
                    blockers.append({"code": "EVIDENCE_REVIEW_REQUIRED", "shot_id": shot["id"], "source_id": source["id"], "message": "Actual case evidence needs a separate review attestation"})
                source_refs[-1]["rights_ready"] = False
            if not source["rights_confirmed"]:
                blockers.append({"code": "RIGHTS_UNCONFIRMED", "shot_id": shot["id"], "source_id": source["id"], "message": "Operator must confirm item-level rights"})
            if source["duration_seconds"] is None and (shot["in_seconds"] is not None or shot["out_seconds"] is not None):
                blockers.append({"code": "MEDIA_DURATION_UNKNOWN", "shot_id": shot["id"], "source_id": source["id"], "message": "Verify media duration before selecting a time range"})
            if source["media_type"].startswith("video/") and (shot["in_seconds"] is None or shot["out_seconds"] is None):
                blockers.append({"code": "VIDEO_INTERVAL_REQUIRED", "shot_id": shot["id"], "source_id": source["id"], "message": "Video sources need a verified continuous in/out interval"})
            if shot["visual_mode"] in {"real-2d", "2.5d"} and not source["allow_transform"]:
                blockers.append({"code": "TRANSFORM_NOT_ALLOWED", "shot_id": shot["id"], "source_id": source["id"], "message": "Confirm local transformation rights for this visual mode"})
            if shot["visual_mode"] == "3d" and not source["allow_imagegen"]:
                blockers.append({"code": "IMAGEGEN_INPUT_NOT_ALLOWED", "shot_id": shot["id"], "source_id": source["id"], "message": "Confirm ImageGen input rights before using this source in a 3D workflow"})
        packet = {"schema": "production-studio-preproduction-handoff-v1", "project_id": project_id, "profile": project["profile"], "revision": project["revision"],
                  "script_sha256": digest(project["script"]), "shots": [{"shot_id": s["id"], "sentence_id": s["sentence_id"], "text": s["text"], "visual_intent": s["visual_intent"], "source_id": s["source_id"], "source_sha256": next((x["sha256"] for x in source_refs if x["source_id"] == s["source_id"]), None), "in_seconds": s["in_seconds"], "out_seconds": s["out_seconds"], "visual_mode": s["visual_mode"], "notes": s["notes"], "source_status": s["source_status"]} for s in shots],
                  "sources": source_refs, "media_artifacts": project["state"].get("media_artifacts", []), "blockers": blockers, "status": "BLOCKED" if blockers else "READY_FOR_SEPARATE_REVIEW", "provider_execution": False, "render": False, "upload": False, "publication": False, "path_free": True}
        packet["packet_sha256"] = digest(packet)
        return packet

    @app.get("/api/studio/projects/{project_id}/export")
    def export_project(project_id: str):
        # Export embeds the exact path-free packet served by GET /handoff.
        data, filename = export_bundle(store, project_id, handoff_packet=handoff(project_id))
        return StreamingResponse(iter([data]), media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{filename}"'})

    def bridge(kind: str):
        config = PROFILES[kind]["native_app"]
        base = config["url"]
        responses = []
        endpoints = ("/api/newsroom", "/health", "/newsroom") if kind == "newsroom" else ("/v1/projects", "/health")
        for endpoint in endpoints:
            try:
                with urllib.request.urlopen(base + endpoint, timeout=8.0) as response:
                    value = json.loads(response.read(2 * 1024 * 1024).decode("utf-8"))
                    responses.append((endpoint, value))
                    if kind == "newsroom" and endpoint == "/api/newsroom":
                        break
            except (OSError, ValueError, urllib.error.URLError):
                continue
        projects_value = next((value for endpoint, value in responses if endpoint in {"/v1/projects", "/api/newsroom"}), [])
        if isinstance(projects_value, dict):
            projects_value = projects_value.get("projects", projects_value.get("items", []))
        if not isinstance(projects_value, list):
            projects_value = []
        safe_projects = []
        for item in projects_value[:100]:
            if isinstance(item, dict):
                safe_projects.append({key: item[key] for key in ("id", "name", "profile", "status", "revision", "updated_at", "created_at") if key in item})
        return {"profile": kind, "native_url": base, "native_route": "/newsroom" if kind == "newsroom" else "/", "port": config["port"], "status": "READY" if responses else "OFFLINE", "projects": safe_projects, "read_only": True}

    @app.get("/api/studio/native/newsroom")
    def native_newsroom():
        return bridge("newsroom")

    @app.get("/api/studio/native/shopping")
    def native_shopping():
        return bridge("shopping")

    # Media routes are attached before the SPA catch-all. A provider worker may
    # pass its router through this factory; importing it is intentionally explicit.
    if include_media:
        from .media_routes import attach_shared_routes
        attach_shared_routes(app, store)
    elif media_router is not None:
        app.include_router(media_router)
    web_dist = Path(__file__).resolve().parents[1] / "web" / "dist"
    if web_dist.is_dir():
        from fastapi.staticfiles import StaticFiles
        app.mount("/", StaticFiles(directory=web_dist, html=True), name="studio-web")
    return app
