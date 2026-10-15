"""Bounded, read-only bridge to the sibling Production Studio WISE library."""

from __future__ import annotations

import base64
import hashlib
import json
import math
import os
from pathlib import Path
import sqlite3
import sys
import threading
from urllib.parse import urlparse
from urllib.request import HTTPRedirectHandler, ProxyHandler, build_opener

MAX_BYTES = 40_000_000
MAX_SOURCES = 500


def fail(code: str) -> None:
    print(json.dumps({"status": "unavailable", "reason": code}, separators=(",", ":")))
    raise SystemExit(0)


def contained_directory(path: Path) -> Path:
    path = path.absolute()
    current = Path(path.anchor)
    for part in path.parts[1:]:
        current = current / part
        if current.is_symlink() or getattr(current, "is_junction", lambda: False)():
            fail("unsafe-path")
    if not path.is_dir():
        fail("missing-directory")
    return path


def contained_file(path: Path, root: Path) -> None:
    if path.parent != root or path.is_symlink() or getattr(path, "is_junction", lambda: False)() or not path.is_file():
        fail("missing-backend")
    if path.resolve(strict=True) != path.absolute():
        fail("unsafe-path")


def setup():
    sibling = Path(os.environ.get("WISE_STUDIO_ROOT", "")) if os.environ.get("WISE_STUDIO_ROOT") else Path(__file__).resolve().parents[3] / "youtube1" / "production-studio"
    # visualmaker/scripts/wise_bridge.py -> checkout root is parents[2].
    sibling = contained_directory(sibling)
    backend = contained_directory(sibling / "backend")
    for name in ("__init__.py", "media.py", "core.py", "wise.py"):
        contained_file(backend / name, backend)
    sys.path.insert(0, str(sibling))
    from backend.core import StudioStore
    from backend import wise as wise_module
    from backend.wise import WiseClient, WiseProtocolError, WiseUnavailable
    class NoRedirect(HTTPRedirectHandler):
        def redirect_request(self, request, fp, code, msg, headers, newurl):
            return None
    opener = build_opener(ProxyHandler({}), NoRedirect())
    def loopback_only(request, timeout):
        parsed = urlparse(request.full_url)
        if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed.username or parsed.password:
            raise WiseUnavailable("WISE destination is not loopback")
        return opener.open(request, timeout=timeout)
    wise_module.urlopen = loopback_only
    return sibling, StudioStore, WiseClient, WiseProtocolError, WiseUnavailable


def open_store(sibling: Path, base):
    root = contained_directory(Path(os.environ.get("STUDIO_DATA_DIR") or sibling / "data"))
    media_root = contained_directory(root / "sources")
    db_path = Path(os.environ.get("STUDIO_DB_PATH") or root / "studio.sqlite3").absolute()
    if db_path.is_symlink() or getattr(db_path, "is_junction", lambda: False)() or not db_path.is_file():
        fail("missing-database")
    if db_path.parent != root:
        # Explicit DB override can be elsewhere, but never via a linked parent.
        contained_directory(db_path.parent)
    class ReadOnlyStore(base):
        def __init__(self):
            self.root = root
            self.media_root = media_root
            self.db_path = db_path
            self.lock = threading.RLock()
            self.db = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True, check_same_thread=False)
            self.db.row_factory = sqlite3.Row
            self.db.execute("PRAGMA query_only=ON")
        def transaction(self):
            raise RuntimeError("read-only WISE bridge")
    try:
        return ReadOnlyStore()
    except sqlite3.Error:
        fail("database-unavailable")


def bounded(value, limit: int) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > limit or any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
        raise ValueError("invalid-text")
    return value


def optional(value, limit: int) -> str:
    if not isinstance(value, str) or len(value) > limit or any(ord(ch) < 32 or ord(ch) == 127 for ch in value):
        raise ValueError("invalid-text")
    return value


def checked_http_url(value: str, optional_value=False) -> str:
    if optional_value and value == "":
        return value
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("invalid-url")
    return value


def sha(value: str) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(ch in "0123456789abcdef" for ch in value)


def details(store, source_id: str, expected_kind: str):
    row = store.row("SELECT id,relative_path,original_sha256,byte_size,media_type,length(metadata_json) AS metadata_size FROM sources WHERE id=?", [source_id])
    if row is None or row["media_type"] != expected_kind or not sha(row["original_sha256"]):
        raise ValueError("source-unavailable")
    if not isinstance(row["byte_size"], int) or row["byte_size"] < 1 or row["byte_size"] > MAX_BYTES:
        raise ValueError("source-too-large")
    if not isinstance(row["metadata_size"], int) or row["metadata_size"] > 10_000:
        raise ValueError("metadata-too-large")
    path = store.resolve_source_path(source_id)
    if path is None or path.stat().st_size != row["byte_size"]:
        raise ValueError("source-missing")
    item = store.recheck_source(source_id)
    duration = item["duration_seconds"]
    if expected_kind == "video" and (not isinstance(duration, (float, int)) or not math.isfinite(duration) or duration <= 0):
        raise ValueError("invalid-duration")
    if expected_kind == "image":
        duration = None
    title = bounded(item["title"], 300)
    creator = bounded(item["creator"], 500)
    source_url = checked_http_url(bounded(item["source_url"], 2048))
    license_name = bounded(item["license"], 200)
    rights_evidence = optional(item["rights_evidence"], 2000)
    license_url = checked_http_url(optional(item["license_url"], 2048), optional_value=True)
    wise_id = f"{source_id}{path.suffix.lower()}"
    card = {"sourceId": source_id, "wiseMediaId": wise_id, "sha256": item["original_sha256"],
            "kind": expected_kind, "title": title, "creator": creator, "sourceUrl": source_url,
            "license": license_name, "licenseUrl": license_url, "rightsEvidence": rights_evidence,
            "rightsConfirmed": bool(item["rights_confirmed"]), "durationSeconds": duration}
    digest = hashlib.sha256(json.dumps(card, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    return card | {"metadataSha256": digest}, path


def read_exact(path: Path) -> bytes:
    before = path.lstat()
    if path.is_symlink() or not path.is_file() or not 0 < before.st_size <= MAX_BYTES:
        raise ValueError("source-unavailable")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    try:
        opened = os.fstat(descriptor)
        if (opened.st_dev, opened.st_ino, opened.st_size) != (before.st_dev, before.st_ino, before.st_size):
            raise ValueError("source-changed")
        with os.fdopen(descriptor, "rb", closefd=False) as file:
            data = file.read(MAX_BYTES + 1)
    finally:
        os.close(descriptor)
    after = path.lstat()
    if after.st_dev != before.st_dev or after.st_ino != before.st_ino or len(data) != before.st_size:
        raise ValueError("source-changed")
    return data


def catalog(store, expected_kind: str):
    rows = store.rows("SELECT id,relative_path,original_sha256,byte_size,media_type,duration_seconds FROM sources ORDER BY id LIMIT ?", [MAX_SOURCES + 1])
    if len(rows) > MAX_SOURCES:
        fail("catalog-too-large")
    result = {}
    for row in rows:
        if row["media_type"] != expected_kind or not sha(row["original_sha256"]):
            continue
        if not isinstance(row["byte_size"], int) or not 0 < row["byte_size"] <= MAX_BYTES:
            continue
        relative = row["relative_path"]
        if not isinstance(relative, str) or not relative or not isinstance(row["id"], str) or len(row["id"]) > 200:
            continue
        # Canonical MediaLibrary identifies indexed media with source ID + extension.
        suffix = Path(relative).suffix.lower()
        result[row["id"]] = {"id": row["id"], "wise_media_id": f"{row['id']}{suffix}",
                             "sha256": row["original_sha256"], "duration": row["duration_seconds"]}
    return result


def span(start, end, duration, kind, raw=False):
    if not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or isinstance(start, bool) or isinstance(end, bool):
        raise ValueError("invalid-span")
    if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end < start:
        raise ValueError("invalid-span")
    if kind == "video" and (end <= start or end > 10_000_000 or (not raw and (end > duration or start >= duration))):
        raise ValueError("invalid-span")
    if kind == "image" and (start != 0 or end != 0):
        raise ValueError("invalid-span")
    return {"startSeconds": float(start), "endSeconds": float(end)}


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in {"search", "import"}:
        fail("invalid-request")
    try:
        request = json.loads(base64.b64decode(sys.argv[2], validate=True))
        if not isinstance(request, dict) or request.get("kind") not in {"image", "video"}:
            fail("invalid-request")
        sibling, base, WiseClient, WiseProtocolError, WiseUnavailable = setup()
        store = open_store(sibling, base)
        try:
            if sys.argv[1] == "search":
                query = bounded(request.get("query"), 120)
                index = catalog(store, request["kind"])
                client = WiseClient()
                if not client.configured:
                    fail("wise-not-configured")
                try:
                    result = client.search(query, top_k=5, source_index=index, search_in=request["kind"])
                except (WiseUnavailable, WiseProtocolError):
                    fail("wise-offline")
                candidates = []
                for hit in result["results"][:5]:
                    try:
                        source_id = hit["source_id"]
                        if source_id not in index or hit["sha256"] != index[source_id]["sha256"]:
                            continue
                        card, _ = details(store, source_id, request["kind"])
                        if hit["source_id"] != card["sourceId"]:
                            continue
                        raw = span(hit["raw_start"], hit["raw_end"], card["durationSeconds"], request["kind"], raw=True)
                        selected = span(hit["start"], hit["end"], card["durationSeconds"], request["kind"])
                        candidates.append(card | {"rawSpan": raw, "selectedSpan": selected})
                    except (ValueError, KeyError, TypeError, AttributeError, OverflowError, OSError):
                        continue
                output = {"status": "available", "candidates": candidates, "counts": {"hits": len(result["results"]), "verified": len(candidates), "unresolved": len(result["unresolved"])}}
            else:
                source_id = bounded(request.get("sourceId"), 200)
                if source_id not in catalog(store, request["kind"]):
                    fail("source-unavailable")
                card, path = details(store, source_id, request["kind"])
                if card["sha256"] != request.get("sha256") or card["metadataSha256"] != request.get("metadataSha256") or card["wiseMediaId"] != request.get("wiseMediaId"):
                    fail("source-changed")
                selected = request.get("selectedSpan")
                if not isinstance(selected, dict) or set(selected) != {"startSeconds", "endSeconds"}:
                    fail("invalid-span")
                span(selected["startSeconds"], selected["endSeconds"], card["durationSeconds"], request["kind"])
                # Recheck again immediately before bytes cross the process boundary.
                data = read_exact(path)
                if len(data) > MAX_BYTES or hashlib.sha256(data).hexdigest() != card["sha256"]:
                    fail("source-changed")
                output = {"status": "available", "source": card, "selectedSpan": selected, "bytesBase64": base64.b64encode(data).decode("ascii")}
            print(json.dumps(output, ensure_ascii=False, separators=(",", ":")))
        finally:
            store.close()
    except (ValueError, KeyError, TypeError, AttributeError, sqlite3.Error, OSError):
        fail("invalid-or-unavailable-source")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
