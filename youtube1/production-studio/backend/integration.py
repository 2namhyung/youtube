"""Stable seam for the media worker and native bridges.

The media worker may import ``get_store`` and ``resolve_source_path`` without
knowing the database layout. Router registration is explicit so a provider
cannot be enabled accidentally by importing this module.
"""

from fastapi import APIRouter, FastAPI
from starlette.routing import Mount

from .core import StudioStore


def get_store(app: FastAPI) -> StudioStore:
    return app.state.store


def resolve_source_path(app: FastAPI, source_id: str):
    return get_store(app).resolve_source_path(source_id)


def get_source(app: FastAPI, source_id: str):
    return get_store(app).recheck_source(source_id)


def record_media_artifact(app: FastAPI, project_id: str, expected_revision: int, artifact: dict) -> dict:
    """Append a path-free, hash-bound pre-production media artifact revision.

    The media worker calls this after decoding and hashing its composite. The
    helper never opens a publication gate and rejects local path material.
    """
    store = get_store(app)
    allowed = {"id", "kind", "sha256", "byte_size", "duration_seconds", "source_ids", "production_eligible", "file_url"}
    if set(artifact) - allowed or any("path" in str(key).lower() for key in artifact):
        raise ValueError("media artifact must be path-free")
    if not artifact.get("id") or not artifact.get("sha256") or not isinstance(artifact.get("source_ids", []), list):
        raise ValueError("media artifact id, hash and source_ids are required")
    if artifact.get("production_eligible") is not False:
        raise ValueError("pre-production artifacts cannot be production eligible")
    if str(artifact.get("file_url", "")).startswith("file:"):
        raise ValueError("media artifact file_url must not be local")
    with store.lock:
        project = store.project(project_id)
        artifacts = [*project["state"].get("media_artifacts", []), dict(artifact)]
        state = {**project["state"], "media_artifacts": artifacts, "downstream_invalidated": True,
                 "invalidated_artifacts": ["voice", "timeline", "render", "publication"]}
        updated = store.record_revision(project_id, expected_revision, "media-artifact", {"artifact": artifact}, state=state)
        store.db.commit()
        return {"project": updated, "artifact": artifact}


def attach_media_router(app: FastAPI, router: APIRouter, *, prefix: str = "") -> None:
    existing = list(app.router.routes)
    app.include_router(router, prefix=prefix)
    added = [route for route in app.router.routes if route not in existing]
    mount_index = next((index for index, route in enumerate(app.router.routes) if isinstance(route, Mount) and route.path == "/"), len(app.router.routes))
    for route in added:
        app.router.routes.remove(route)
    for offset, route in enumerate(added):
        app.router.routes.insert(mount_index + offset, route)
