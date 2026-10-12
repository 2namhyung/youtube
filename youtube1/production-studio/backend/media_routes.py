"""FastAPI routes for the shared media library, CC candidate search and WISE."""

from __future__ import annotations

import os
import hashlib
import mimetypes
import re
import threading
import uuid
from typing import Any
from urllib.parse import urlencode
from urllib.error import HTTPError
from urllib.request import Request, urlopen
import json

from fastapi import APIRouter, FastAPI, Header, HTTPException, Query
from fastapi.responses import FileResponse

from .media import MediaError, MediaLibrary, MediaNotFound, RightsError
from .wise import WiseClient, WiseProtocolError, WiseUnavailable


def _youtube_api_request(key: str, params: dict[str, str]) -> tuple[dict[str, Any] | None, str | None]:
    """Return (payload, safe error code); never expose the request URL or body."""
    request_params = dict(params)
    request_params["key"] = key
    target = "https://www.googleapis.com/youtube/v3/search?" + urlencode(request_params)
    request = Request(target, headers={"Accept": "application/json"})
    try:
        with urlopen(request, timeout=10) as response:
            payload = json.loads(response.read(2 * 1024 * 1024).decode("utf-8"))
        return (payload if isinstance(payload, dict) else {}), None
    except HTTPError as exc:
        # The response contains useful machine-readable reason codes, but its
        # text can contain request details. Keep only a small allowlisted code.
        try:
            body = json.loads(exc.read(256 * 1024).decode("utf-8", errors="replace"))
            errors = body.get("error", {}).get("errors", []) if isinstance(body, dict) else []
            reason = errors[0].get("reason") if errors and isinstance(errors[0], dict) else None
            status = body.get("error", {}).get("status") if isinstance(body, dict) else None
            return None, str(reason or status or f"http_{exc.code}")[:80]
        except Exception:
            return None, f"http_{exc.code}"
    except Exception:
        return None, "request_failed"


def _youtube_search(query: str, max_results: int, page_token: str = "") -> dict[str, Any]:
    keys = []
    for name in ("YOUTUBE_API_KEY", "YOUTUBE_API_KEY_2"):
        value = os.environ.get(name, "").strip()
        if value and value not in keys:
            keys.append(value)
    if not keys:
        return {"status": "offline", "reason": "YOUTUBE_API_KEY is not configured", "items": []}
    params = {
        "part": "snippet", "q": query, "type": "video", "videoLicense": "creativeCommon",
        "maxResults": str(max_results),
    }
    if page_token:
        params["pageToken"] = page_token

    # A second configured key is only an authentication recovery path. A
    # quota response must remain visible as quota exhaustion, never rotate
    # keys and accidentally hide the operational problem.
    payload = None
    error_code = None
    auth_reasons = {"keyinvalid", "api_key_invalid", "accessnotconfigured", "iprefererblocked"}
    for index, key in enumerate(keys):
        payload, error_code = _youtube_api_request(key, params)
        if payload is not None:
            break
        if index == 0 and len(keys) > 1 and (error_code or "").lower().replace("-", "_") in auth_reasons:
            continue
        break
    if payload is None:
        normalized = (error_code or "").lower().replace("-", "_")
        quota_reasons = {"quotaexceeded", "dailylimitexceeded", "ratelimitexceeded", "http_429"}
        if normalized in quota_reasons:
            return {"status": "quota", "reason": error_code, "items": []}
        if normalized in auth_reasons:
            return {"status": "offline", "reason": "YouTube API authentication failed", "items": []}
        return {"status": "offline", "reason": "YouTube Data API request failed", "items": []}
    items = []
    for item in payload.get("items", []) if isinstance(payload, dict) else []:
        snippet = item.get("snippet", {}) if isinstance(item, dict) else {}
        video_id = (item.get("id", {}) or {}).get("videoId", "")
        if not video_id:
            continue
        items.append({
            "video_id": video_id,
            "title": snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "creator": snippet.get("channelTitle", ""),
            "channel_id": snippet.get("channelId", ""),
            "published_at": snippet.get("publishedAt", ""),
            "thumbnail": (snippet.get("thumbnails", {}).get("high", {}) or {}).get("url", ""),
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "license": "creativeCommon",
            "rights_state": "candidate-unconfirmed",
            "attribution_required": True,
            "downloaded": False,
        })
    return {"status": "available", "items": items, "next_page_token": payload.get("nextPageToken", "")}


def create_router(media: MediaLibrary | None = None, wise: WiseClient | None = None,
                  app: FastAPI | None = None) -> APIRouter:
    library = media or MediaLibrary()
    wise_client = wise or WiseClient()
    router = APIRouter(prefix="/api/studio", tags=["studio-media"])
    index_jobs: dict[str, dict[str, Any]] = {}

    def safe_reason(exc: Exception) -> str:
        text = re.sub(r"(?:[A-Za-z]:\\|/)[^\s;]+", "<redacted-path>", str(exc))
        return text[:240] or "operation failed"

    def active_wise_client() -> WiseClient:
        if wise_client.configured:
            return wise_client
        store = getattr(library, "store", None)
        if store is not None:
            try:
                from scripts.wise_index import read_active
                active = read_active(store) or {}
                if active.get("wise_url"):
                    return WiseClient(str(active["wise_url"]))
            except Exception:
                pass
        return wise_client

    @router.get("/sources/{source_id}/file")
    def source_file(source_id: str):
        try:
            record = library.get(source_id)
        except MediaNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        path = library._record_path(record)
        return FileResponse(path, filename=record.filename)

    @router.post("/projects/{project_id}/composite")
    def composite(project_id: str, body: dict[str, Any], idempotency_key: str = Header(default="", alias="Idempotency-Key")):
        store = getattr(library, "store", None)
        expected_revision = body.get("expected_revision")
        request_hash = hashlib.sha256(json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        if not idempotency_key:
            idempotency_key = request_hash
        output_id = "composite_" + hashlib.sha256(f"{project_id}:{idempotency_key}".encode("utf-8")).hexdigest()[:24]
        existing = next((item for item in library.list_composites(project_id) if item.get("id") == output_id), None)
        if existing:
            if existing.get("request_hash") != request_hash:
                raise HTTPException(status_code=409, detail="Idempotency-Key was already used for another composite")
            existing = dict(existing)
            existing.pop("path", None)
            existing["file_url"] = f"/api/studio/projects/{project_id}/composites/{output_id}/file"
            return existing
        project_before = None
        if store is not None:
            try:
                project_before = store.project(project_id)
                if not isinstance(expected_revision, int) or isinstance(expected_revision, bool) or expected_revision < 1:
                    raise HTTPException(status_code=400, detail="expected_revision is required for a canonical project")
                if project_before.get("revision") != expected_revision:
                    raise HTTPException(status_code=409, detail="Project changed; reload the latest revision")
            except HTTPException:
                raise
        try:
            result = library.composite_preview(
                project_id=project_id,
                background_id=str(body.get("background_source_id", body.get("background_id", ""))),
                character_id=str(body.get("character_source_id", body.get("character_id", ""))),
                x=body.get("x", 0), y=body.get("y", 0), scale=body.get("scale", 1),
                duration=body.get("duration", 3), output_id=output_id, request_hash=request_hash,
            )
        except RightsError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except (MediaError, OSError) as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        result["file_url"] = f"/api/studio/projects/{project_id}/composites/{result['id']}/file"
        if store is not None and project_before is not None:
            # Bind the decoded, hash-checked preview to the same revision that
            # admitted its sources. record_media_artifact performs the final
            # compare-and-swap and advances the project revision atomically.
            try:
                from .integration import record_media_artifact
                artifact = {
                    "id": result["id"], "kind": result["kind"],
                    "sha256": result["sha256"], "byte_size": result["bytes"],
                    "duration_seconds": result["duration"],
                    "source_ids": [result["background_source_id"], result["character_source_id"]],
                    "production_eligible": False, "file_url": result["file_url"],
                }
                artifact_app = app
                if artifact_app is None:
                    # Standalone router tests do not have a FastAPI host, but
                    # the integration seam only needs the canonical store.
                    from types import SimpleNamespace
                    artifact_app = SimpleNamespace(state=SimpleNamespace(store=store))
                updated = record_media_artifact(artifact_app, project_id, expected_revision, artifact)
                result["project_revision"] = updated["project"]["revision"]
                # Keep the CAS revision on the durable composite record so a
                # retry can be served without re-rendering or re-binding it.
                try:
                    metadata_path = library.composite_path(project_id, result["id"]).with_suffix(".json")
                    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
                    metadata["project_revision"] = result["project_revision"]
                    metadata_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
                except (OSError, ValueError) as exc:
                    raise HTTPException(status_code=409, detail="Composite metadata could not be persisted") from exc
            except HTTPException:
                # Keep the output directory free of a preview that was rejected
                # by the project CAS.
                try:
                    path = library.composite_path(project_id, result["id"])
                    path.unlink(missing_ok=True)
                    path.with_suffix(".json").unlink(missing_ok=True)
                except Exception:
                    pass
                raise
            except (OSError, ValueError) as exc:
                raise HTTPException(status_code=409, detail="Composite could not be bound to the project revision") from exc
        result.pop("path", None)
        return result

    @router.get("/projects/{project_id}/composites")
    def composites(project_id: str):
        items = []
        for item in library.list_composites(project_id):
            item = dict(item)
            item.pop("path", None)
            item["file_url"] = f"/api/studio/projects/{project_id}/composites/{item['id']}/file"
            items.append(item)
        return {"items": items}

    @router.get("/projects/{project_id}/composites/{composite_id}/file")
    def composite_file(project_id: str, composite_id: str):
        try:
            path = library.composite_path(project_id, composite_id)
        except MediaNotFound as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        return FileResponse(path, media_type="video/mp4", filename=path.name)

    @router.get("/youtube")
    def youtube(q: str = Query(min_length=1, max_length=200), max_results: int = Query(default=10, ge=1, le=25), page_token: str = Query(default="", max_length=200)):
        return _youtube_search(q.strip(), max_results, page_token)

    @router.get("/wise/status")
    def wise_status():
        result = active_wise_client().status()
        store = getattr(library, "store", None)
        if store is not None:
            try:
                from scripts.wise_index import read_active
                active = read_active(store)
            except Exception:
                active = None
            if active:
                result["active_run"] = {key: active.get(key) for key in ("run_id", "source_count", "wise_url", "server_pid")}
        return result

    @router.post("/wise/search")
    def wise_search(body: dict[str, Any]):
        query = str(body.get("query", "")).strip()
        top_k = body.get("top_k", 10)
        search_in = body.get("search_in", body.get("modality"))
        index = {record.id: record.to_dict() for record in library.list()}
        try:
            return active_wise_client().search(query, int(top_k), index, str(search_in) if search_in is not None else None)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except WiseUnavailable as exc:
            return {"status": "offline", "reason": str(exc), "results": [], "unresolved": []}
        except WiseProtocolError as exc:
            return {"status": "unavailable", "reason": str(exc), "results": [], "unresolved": []}

    @router.post("/wise/index")
    def wise_index(body: dict[str, Any], idempotency_key: str = Header(default="", alias="Idempotency-Key")):
        source_ids = body.get("source_ids", [])
        if not isinstance(source_ids, list) or not source_ids or len(source_ids) > 500 or not all(isinstance(item, str) for item in source_ids):
            raise HTTPException(status_code=400, detail="source_ids must contain one to 500 source ids")
        store = getattr(library, "store", None)
        if store is None:
            return {"status": "offline", "reason": "WISE indexing requires the canonical StudioStore"}
        if not idempotency_key:
            idempotency_key = hashlib.sha256(json.dumps(sorted(source_ids), separators=(",", ":")).encode("utf-8")).hexdigest()
        # Reject unsupported media before creating a queued job. WISE's
        # extractor can index images and videos for this studio; audio-only
        # or unknown uploads must not become a misleading pending job.
        for source_id in source_ids:
            try:
                source = store.recheck_source(source_id)
                source_path = store.resolve_source_path(source_id)
            except HTTPException:
                raise
            media_type = str(source.get("media_type", "")).lower().split(";", 1)[0].strip()
            guessed_type = mimetypes.guess_type(source_path.name)[0] if source_path is not None else ""
            effective_type = media_type or guessed_type or ""
            if not source.get("rights_confirmed"):
                raise HTTPException(status_code=409, detail="WISE indexing requires confirmed source rights")
            if effective_type.startswith("audio/"):
                raise HTTPException(status_code=400, detail="WISE indexing accepts images and videos, not audio-only sources")
            if not (effective_type.startswith("image/") or effective_type.startswith("video/")):
                raise HTTPException(status_code=400, detail="WISE indexing requires an image or video source")
        job_id = "wise-job-" + hashlib.sha256(idempotency_key.encode("utf-8")).hexdigest()[:24]
        existing = index_jobs.get(job_id)
        if existing:
            if existing.get("source_ids") != source_ids:
                raise HTTPException(status_code=409, detail="Idempotency-Key was already used for another WISE source set")
            return existing
        try:
            from scripts.wise_index import read_job
            persisted = read_job(store, job_id)
        except Exception:
            persisted = None
        if persisted:
            if persisted.get("source_ids") != source_ids:
                raise HTTPException(status_code=409, detail="Idempotency-Key was already used for another WISE source set")
            index_jobs[job_id] = persisted
            return persisted
        index_jobs[job_id] = {"id": job_id, "status": "queued", "source_count": len(source_ids), "source_ids": source_ids}

        def worker() -> None:
            try:
                try:
                    from scripts.wise_index import run_index, write_job
                except ImportError:
                    from ..scripts.wise_index import run_index, write_job
                result = run_index(store, source_ids)
                result_payload = {"id": job_id, "status": "ready", "source_count": result["source_count"], "run_id": result["run_id"], "wise_url": result.get("wise_url", ""), "server_pid": result.get("server_pid"), "source_ids": source_ids}
                write_job(store, job_id, result_payload)
                index_jobs[job_id] = result_payload
                if result.get("wise_url") and not wise_client.configured:
                    wise_client.base_url = result["wise_url"]
                    wise_client.search_path = "/search2"
            except Exception as exc:
                failed = {"id": job_id, "status": "failed", "source_count": len(source_ids), "source_ids": source_ids, "reason": safe_reason(exc)}
                try:
                    write_job(store, job_id, failed)
                except Exception:
                    pass
                index_jobs[job_id] = failed

        index_jobs[job_id]["status"] = "running"
        try:
            from scripts.wise_index import write_job
            write_job(store, job_id, index_jobs[job_id])
        except Exception:
            pass
        threading.Thread(target=worker, name=job_id, daemon=True).start()
        return index_jobs[job_id]

    @router.get("/wise/index/{job_id}")
    def wise_index_status(job_id: str):
        job = index_jobs.get(job_id)
        if not job:
            store = getattr(library, "store", None)
            if store is not None:
                try:
                    from scripts.wise_index import read_job
                    job = read_job(store, job_id)
                except Exception:
                    job = None
        if not job:
            raise HTTPException(status_code=404, detail="WISE indexing job not found")
        return job

    return router


def attach_shared_routes(app: FastAPI, store: Any, wise: WiseClient | None = None) -> None:
    """Attach routes to the canonical app/store without creating a second source table."""
    from .media import StoreMediaLibrary
    app.include_router(create_router(StoreMediaLibrary(store), wise, app=app))


router = create_router()
