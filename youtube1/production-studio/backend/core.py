from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import tempfile
import threading
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from fastapi import HTTPException


VERSION = "production-studio-v1"
PROFILES = {
    "newsroom": {
        "label": "내무습다 · 사건 영상",
        "stages": ["script", "shot-needs", "sources", "storyboard", "i2v", "qa", "handoff"],
        "native_app": {"url": "http://127.0.0.1:3002", "port": 3002},
    },
    "shopping": {
        "label": "쇼핑 쇼츠",
        "stages": ["story-discovery", "product-evidence", "script", "sources", "shots", "voice", "render", "handoff"],
        "native_app": {"url": "http://127.0.0.1:8765", "port": 8765},
    },
}
LICENSES = {"CC-BY", "CC0", "public-domain", "permission", "owned", "unknown"}
ROLES = {"context", "evidence", "broll", "character"}
VISUAL_MODES = {"real-2d", "2.5d", "3d", "source"}
MAX_UPLOAD_BYTES = int(os.environ.get("STUDIO_MAX_UPLOAD_BYTES", str(250 * 1024 * 1024)))
ALLOWED_UPLOAD_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".wav", ".mp3", ".m4a"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def canonical(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value: Any) -> str:
    raw = value if isinstance(value, bytes) else canonical(value).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def uid(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(10)}"


def json_object(value: Any, field: str) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise HTTPException(422, detail={"code": "INVALID_JSON", "field": field}) from exc
        if isinstance(parsed, dict):
            return parsed
    raise HTTPException(422, detail={"code": "INVALID_OBJECT", "field": field})


def require(condition: bool, code: str, message: str, status: int = 400) -> None:
    if not condition:
        raise HTTPException(status, detail={"code": code, "message": message})


def safe_json(value: Any) -> Any:
    """Remove local paths and untrusted provider payloads from public bridge output."""
    if isinstance(value, dict):
        return {k: safe_json(v) for k, v in value.items() if "path" not in k.lower() and k.lower() not in {"local_file", "filesystem"}}
    if isinstance(value, list):
        return [safe_json(v) for v in value]
    return value


class StudioStore:
    def __init__(self, root: str | Path | None = None, db_path: str | Path | None = None):
        self.root = Path(root or os.environ.get("STUDIO_DATA_DIR") or Path(__file__).resolve().parents[1] / "data").resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.media_root = (self.root / "sources").resolve()
        self.media_root.mkdir(parents=True, exist_ok=True)
        self.db_path = Path(db_path or os.environ.get("STUDIO_DB_PATH") or self.root / "studio.sqlite3").resolve()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(self.db_path, check_same_thread=False)
        self.lock = threading.RLock()
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.execute("PRAGMA busy_timeout=5000")
        self._init_schema()

    def _init_schema(self) -> None:
        self.db.executescript(
            """
            CREATE TABLE IF NOT EXISTS projects(
              id TEXT PRIMARY KEY, name TEXT NOT NULL, profile TEXT NOT NULL,
              revision INTEGER NOT NULL, script TEXT NOT NULL DEFAULT '', state_json TEXT NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS project_revisions(
              project_id TEXT NOT NULL, revision INTEGER NOT NULL, operation TEXT NOT NULL,
              payload_json TEXT NOT NULL, payload_hash TEXT NOT NULL, created_at TEXT NOT NULL,
              PRIMARY KEY(project_id, revision)
            );
            CREATE TABLE IF NOT EXISTS sources(
              id TEXT PRIMARY KEY, title TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '',
              creator TEXT NOT NULL DEFAULT '', license TEXT NOT NULL, license_url TEXT NOT NULL DEFAULT '',
              rights_evidence TEXT NOT NULL DEFAULT '', rights_confirmed INTEGER NOT NULL DEFAULT 0,
              role TEXT NOT NULL, allow_transform INTEGER NOT NULL DEFAULT 0,
              allow_imagegen INTEGER NOT NULL DEFAULT 0, allow_omni INTEGER NOT NULL DEFAULT 0,
              relative_path TEXT, original_sha256 TEXT, byte_size INTEGER NOT NULL DEFAULT 0,
              media_type TEXT NOT NULL DEFAULT '', duration_seconds REAL, created_at TEXT NOT NULL,
              metadata_json TEXT NOT NULL DEFAULT '{}'
            );
            CREATE TABLE IF NOT EXISTS shots(
              id TEXT PRIMARY KEY, project_id TEXT NOT NULL, shot_number INTEGER NOT NULL,
              sentence_id TEXT NOT NULL, text TEXT NOT NULL, query TEXT NOT NULL,
              visual_intent TEXT NOT NULL, source_id TEXT, in_seconds REAL, out_seconds REAL,
              visual_mode TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', source_status TEXT NOT NULL,
              created_revision INTEGER NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS conforms(
              id TEXT PRIMARY KEY, project_id TEXT NOT NULL, revision INTEGER NOT NULL,
              before_text TEXT NOT NULL, after_text TEXT NOT NULL, change_note TEXT NOT NULL,
              facts_confirmed INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS idempotency(
              scope TEXT NOT NULL, idem_key TEXT NOT NULL, request_hash TEXT NOT NULL,
              response_json TEXT NOT NULL, PRIMARY KEY(scope, idem_key)
            );
            CREATE INDEX IF NOT EXISTS shots_project_idx ON shots(project_id, shot_number);
            CREATE INDEX IF NOT EXISTS revisions_project_idx ON project_revisions(project_id, revision);
            """
        )
        self.db.commit()

    def close(self) -> None:
        self.db.close()

    def row(self, sql: str, args: Iterable[Any] = ()) -> sqlite3.Row | None:
        with self.lock:
            return self.db.execute(sql, tuple(args)).fetchone()

    def rows(self, sql: str, args: Iterable[Any] = ()) -> list[sqlite3.Row]:
        with self.lock:
            return self.db.execute(sql, tuple(args)).fetchall()

    def transaction(self):
        return self.db

    def project(self, project_id: str) -> dict[str, Any]:
        with self.lock:
            row = self.row("SELECT * FROM projects WHERE id=?", [project_id])
            require(row is not None, "PROJECT_NOT_FOUND", "Project not found", 404)
            state = json.loads(row["state_json"])
            all_shots = [dict(r) for r in self.rows("SELECT * FROM shots WHERE project_id=? ORDER BY shot_number,created_revision", [project_id])]
            active_ids = set(state.get("shot_ids", []))
            shots = [shot for shot in all_shots if shot["id"] in active_ids]
            conforms = [dict(r) for r in self.rows("SELECT * FROM conforms WHERE project_id=? ORDER BY revision", [project_id])]
            for c in conforms:
                c["facts_confirmed"] = bool(c["facts_confirmed"])
            source_ids = {shot["source_id"] for shot in all_shots if shot.get("source_id")}
            linked_sources = [self.source(source_id) for source_id in source_ids]
            return {"id": row["id"], "name": row["name"], "profile": row["profile"], "revision": row["revision"],
                    "script": row["script"], "state": state, "shots": shots,
                    "shot_history": [{**shot, "current": shot["id"] in active_ids} for shot in all_shots], "sources": linked_sources, "conforms": conforms,
                    "created_at": row["created_at"], "updated_at": row["updated_at"]}

    def source(self, source_id: str) -> dict[str, Any]:
        with self.lock:
            row = self.row("SELECT * FROM sources WHERE id=?", [source_id])
            require(row is not None, "SOURCE_NOT_FOUND", "Source not found", 404)
            item = dict(row)
            for key in ("rights_confirmed", "allow_transform", "allow_imagegen", "allow_omni"):
                item[key] = bool(item[key])
            item["metadata"] = json.loads(item.pop("metadata_json"))
            item["path_available"] = bool(item.pop("relative_path"))
            item["origin"] = item["metadata"].get("context", item["metadata"].get("origin", "unspecified"))
            item["preview"] = {"status": "available" if item["path_available"] else "metadata-only", "media_type": item["media_type"], "duration_seconds": item["duration_seconds"]}
            return item

    def resolve_source_path(self, source_id: str) -> Path | None:
        with self.lock:
            row = self.row("SELECT relative_path FROM sources WHERE id=?", [source_id])
            require(row is not None, "SOURCE_NOT_FOUND", "Source not found", 404)
            relative = row["relative_path"]
            if not relative:
                return None
            raw_candidate = self.media_root / Path(relative)
            try:
                relative_parts = raw_candidate.relative_to(self.media_root).parts
            except ValueError as exc:
                raise HTTPException(500, detail={"code": "SOURCE_PATH_ESCAPE", "message": "Source is outside storage"}) from exc
            current = self.media_root
            for part in relative_parts:
                current = current / part
                if current.is_symlink() or bool(getattr(current, "is_junction", lambda: False)()):
                    raise HTTPException(409, detail={"code": "SOURCE_SYMLINK", "message": "Symlinked source bytes are not accepted"})
            candidate = raw_candidate.resolve(strict=False)
            require(candidate == self.media_root or self.media_root in candidate.parents, "SOURCE_PATH_ESCAPE", "Source is outside storage", 500)
            require(candidate.is_file() and not candidate.is_symlink(), "SOURCE_BYTES_MISSING", "Source bytes are unavailable", 409)
            return candidate

    def recheck_source(self, source_id: str) -> dict[str, Any]:
        with self.lock:
            source = self.source(source_id)
            path = self.resolve_source_path(source_id)
            if path:
                size = path.stat().st_size
                sha = hashlib.sha256(path.read_bytes()).hexdigest()
                require(size == source["byte_size"] and sha == source["original_sha256"], "SOURCE_DRIFT", "Source bytes changed", 409)
            return source

    def put_source_bytes(self, source_id: str, content: bytes, suffix: str = "") -> tuple[str, int, str]:
        target_dir = (self.media_root / source_id).resolve()
        require(self.media_root in target_dir.parents, "SOURCE_PATH_ESCAPE", "Invalid source storage target", 500)
        target_dir.mkdir(parents=True, exist_ok=False)
        ext = suffix if suffix and re.fullmatch(r"\.[A-Za-z0-9]{1,12}", suffix) else ""
        target = target_dir / ("original" + ext)
        target.write_bytes(content)
        sha = hashlib.sha256(content).hexdigest()
        return str(target.relative_to(self.media_root)), len(content), sha

    def record_revision(self, project_id: str, expected_revision: int, operation: str, payload: dict[str, Any], *, script: str | None = None, state: dict[str, Any] | None = None) -> dict[str, Any]:
        row = self.row("SELECT revision,script,state_json FROM projects WHERE id=?", [project_id])
        require(row is not None, "PROJECT_NOT_FOUND", "Project not found", 404)
        require(int(row["revision"]) == expected_revision, "REVISION_CONFLICT", "Project changed; reload the latest revision", 409)
        next_revision = expected_revision + 1
        next_script = row["script"] if script is None else script
        next_state = json.loads(row["state_json"]) if state is None else state
        timestamp = now()
        snapshot = {"operation": operation, "project_id": project_id, "revision": next_revision,
                    "script": next_script, "state": next_state, "payload": payload}
        changed = self.db.execute(
            "UPDATE projects SET revision=?,script=?,state_json=?,updated_at=? WHERE id=? AND revision=?",
            (next_revision, next_script, canonical(next_state), timestamp, project_id, expected_revision),
        )
        require(changed.rowcount == 1, "REVISION_CONFLICT", "Project changed; reload the latest revision", 409)
        self.db.execute("INSERT INTO project_revisions VALUES(?,?,?,?,?,?)",
                        (project_id, next_revision, operation, canonical(snapshot), digest(snapshot), timestamp))
        return self.project(project_id)


def split_units(script: str) -> list[str]:
    return [p.strip() for p in re.split(r"(?:\r?\n)+|(?<=[.!?。！？])\s*", script.strip()) if p.strip()]


def visual_intent(sentence: str, profile: str) -> str:
    text = sentence.casefold()
    terms = {
        "location": ("장소·현실 배경", ("거리", "골목", "집", "학교", "병원", "매장", "현장", "장소", "street", "room")),
        "person-action": ("인물 행동·2D 캐릭터 합성", ("사람", "남자", "여자", "아이", "경찰", "움직", "달리", "말하", "잡", "person", "walk")),
        "object": ("사물·제품 클로즈업", ("제품", "물건", "차", "휴대폰", "문", "상자", "상품", "product", "car")),
    }
    for _, (label, words) in terms.items():
        if any(word in text for word in words):
            return label
    return "설명용 자료화면·모션 그래픽" if profile == "newsroom" else "제품 사용 장면·상세 컷"


def query_terms(sentence: str) -> str:
    words = re.findall(r"[가-힣A-Za-z0-9]{2,}", sentence)
    return " ".join(words[:8])


def probe_duration(path: Path) -> float | None:
    ffprobe = shutil.which(os.environ.get("STUDIO_FFPROBE", "ffprobe"))
    if not ffprobe:
        return None
    try:
        result = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "json", str(path)],
                                capture_output=True, text=True, timeout=10, check=False)
        value = json.loads(result.stdout).get("format", {}).get("duration")
        return float(value) if value is not None else None
    except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired):
        return None


def attribution(source: dict[str, Any]) -> str:
    parts = [source["title"] or "Untitled source"]
    if source.get("creator"):
        parts.append(f"creator: {source['creator']}")
    if source.get("source_url"):
        parts.append(source["source_url"])
    parts.append(f"license: {source['license']}")
    if source.get("license_url"):
        parts.append(source["license_url"])
    if source.get("rights_evidence"):
        parts.append(f"rights evidence: {source['rights_evidence']}")
    return " | ".join(parts)


def strict_bool(value: Any, field: str, *, default: bool = False, allow_text: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if allow_text and isinstance(value, str) and value.lower() in {"true", "false"}:
        return value.lower() == "true"
    raise ValueError(f"{field} must be a boolean")


def validate_upload(filename: str, media_type: str, content: bytes) -> str:
    if not filename or "\x00" in filename or Path(filename).name != filename or ".." in Path(filename).parts:
        raise ValueError("unsafe upload filename")
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ValueError("unsupported media extension")
    if suffix == ".png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("PNG signature mismatch")
    if suffix in {".jpg", ".jpeg"} and not content.startswith(b"\xff\xd8\xff"):
        raise ValueError("JPEG signature mismatch")
    if media_type and not (media_type.startswith(("video/", "audio/", "image/")) or media_type in {"application/octet-stream", "application/mp4"}):
        raise ValueError("unsupported media type")
    return suffix


def export_bundle(store: StudioStore, project_id: str, *, handoff_packet: dict[str, Any] | None = None) -> tuple[bytes, str]:
    """Build the path-free review bundle from one project revision.

    ``handoff_packet`` is supplied by the API route so ``handoff.json`` is
    byte-for-byte the same packet returned by the GET handoff endpoint.
    """
    project = store.project(project_id)
    sources: dict[str, dict[str, Any]] = {}
    source_ids = {shot["source_id"] for shot in project["shots"] if shot.get("source_id")}
    for artifact in project.get("state", {}).get("media_artifacts", []):
        if isinstance(artifact, dict):
            source_ids.update(source_id for source_id in artifact.get("source_ids", []) if source_id)
    for source_id in source_ids:
        source = store.recheck_source(source_id)
        source.pop("path_available", None)
        sources[source_id] = source
    packet = {
        "schema": "production-studio-export-v1",
        "project": project,
        "sources": sources,
        "source_attribution": [attribution(sources[sid]) for sid in sorted(sources)],
        "publication_authorized": False,
    }
    credits = "\n".join(["Production Studio source attribution", "", *packet["source_attribution"]]) + "\n"
    handoff = handoff_packet if handoff_packet is not None else {
        "schema": "production-studio-preproduction-handoff-v1",
        "project_id": project_id,
        "profile": project["profile"],
        "revision": project["revision"],
        "media_artifacts": project.get("state", {}).get("media_artifacts", []),
        "blockers": [{"code": "HANDOFF_PACKET_UNAVAILABLE", "message": "Fetch the handoff packet before exporting"}],
        "status": "BLOCKED",
        "provider_execution": False,
        "render": False,
        "upload": False,
        "publication": False,
        "path_free": True,
    }
    buffer = tempfile.SpooledTemporaryFile(max_size=2 * 1024 * 1024)
    project_bytes = json.dumps(packet, ensure_ascii=False, indent=2).encode("utf-8")
    credit_bytes = credits.encode("utf-8")
    handoff_bytes = json.dumps(handoff, ensure_ascii=False, indent=2).encode("utf-8")
    members = {"project.json": project_bytes, "handoff.json": handoff_bytes, "attribution.md": credit_bytes}
    checksums = {name: hashlib.sha256(value).hexdigest() for name, value in members.items()}
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for name, value in members.items():
            archive.writestr(name, value)
        archive.writestr("SHA256SUMS.json", json.dumps(checksums, indent=2).encode("utf-8"))
    buffer.seek(0)
    return buffer.read(), f"production-studio-{project_id}.zip"
