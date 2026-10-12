"""Shared local media library and safe FFmpeg compositing.

The studio keeps source rights and bytes separate from provider/search metadata.  A
YouTube result is a candidate only; it cannot be used by the compositor until a
local source is ingested with an explicit local-edit and transformation
attestation.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import secrets
import shutil
import subprocess
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable


MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024
MAX_PREVIEW_SECONDS = 60.0
MIN_PREVIEW_SECONDS = 0.1


class MediaError(ValueError):
    """A user-correctable media request error."""


class RightsError(MediaError):
    """The source has not been cleared for the requested local transformation."""


class MediaNotFound(MediaError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path: Path, *, chunk_size: int = 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(chunk_size), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _real_child(root: Path, value: str | Path) -> Path:
    """Resolve a contained non-symlink path, rejecting traversal and links."""
    candidate = Path(value)
    root_absolute = root.absolute()
    lexical = candidate if candidate.is_absolute() else root_absolute / candidate
    # Check the requested path before resolving it. Resolving first would hide
    # a symlink/reparse component behind its target.
    try:
        lexical_relative = lexical.absolute().relative_to(root_absolute)
    except ValueError as exc:
        raise MediaError("media path is outside the studio media root") from exc
    current = root_absolute
    for part in lexical_relative.parts:
        current = current / part
        if current.is_symlink() or bool(getattr(current, "is_junction", lambda: False)()):
            raise MediaError("symlinked media paths are not accepted")
    resolved = lexical.resolve(strict=False)
    root_real = root.resolve(strict=False)
    try:
        resolved.relative_to(root_real)
    except ValueError as exc:
        raise MediaError("media path is outside the studio media root") from exc
    current = root_real
    try:
        relative_parts = resolved.relative_to(root_real).parts
    except ValueError as exc:
        raise MediaError("media path is outside the studio media root") from exc
    for part in relative_parts:
        current = current / part
        if current.is_symlink() or bool(getattr(current, "is_junction", lambda: False)()):
            raise MediaError("symlinked media paths are not accepted")
    return resolved


def _number(value: Any, name: str, low: float, high: float) -> float:
    if isinstance(value, bool):
        raise MediaError(f"{name} must be numeric")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise MediaError(f"{name} must be numeric") from exc
    if number != number or number in (float("inf"), float("-inf")) or not low <= number <= high:
        raise MediaError(f"{name} must be between {low} and {high}")
    return number


def _safe_project_id(value: str) -> str:
    project_id = str(value).strip()
    if not project_id or len(project_id) > 120 or not project_id.replace("-", "").replace("_", "").isalnum():
        raise MediaError("project_id is invalid")
    return project_id


@dataclass(frozen=True)
class RightsAttestation:
    source_use: str
    transformation: str | bool
    attribution: str = ""
    basis_url: str = ""
    confirmed: bool = False

    @classmethod
    def from_value(cls, value: Any) -> "RightsAttestation":
        if not isinstance(value, dict):
            raise RightsError("source rights attestation is required")
        return cls(
            source_use=str(value.get("source_use", value.get("sourceUse", ""))).strip().lower(),
            transformation=value.get("transformation", value.get("transform", "")),
            attribution=str(value.get("attribution", "")).strip(),
            basis_url=str(value.get("basis_url", value.get("basisUrl", ""))).strip(),
            confirmed=bool(value.get("confirmed", False)),
        )

    def allows_local_edit(self) -> bool:
        use = self.source_use.replace("-", "_")
        transform = self.transformation
        transform_ok = transform is True or str(transform).strip().lower() in {
            "allowed", "local_edit", "local-edit", "yes", "true", "permitted",
        }
        use_ok = use in {"owned", "licensed", "cc0", "cc_by", "public_domain", "publicdomain"}
        if use == "cc_by" and not self.attribution:
            return False
        return bool(self.confirmed and use_ok and transform_ok)


@dataclass
class MediaRecord:
    id: str
    project_id: str
    path: str
    filename: str
    media_kind: str
    sha256: str
    bytes: int
    rights: dict[str, Any]
    source_url: str = ""
    duration: float | None = None
    width: int | None = None
    height: int | None = None
    wise_media_id: str = ""
    pixel_format: str | None = None
    has_alpha: bool | None = None
    created_at: str = field(default_factory=utc_now)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class MediaLibrary:
    """Small append-only JSON catalog used by both local production profiles."""

    def __init__(self, root: str | Path | None = None, ffprobe: str | None = None) -> None:
        base = Path(root or os.environ.get("STUDIO_MEDIA_ROOT", Path(__file__).resolve().parents[1] / "data" / "media"))
        self.root = base.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.catalog_path = self.root / "catalog.json"
        self.ffprobe = ffprobe or os.environ.get("STUDIO_FFPROBE", "ffprobe")
        self._records: dict[str, MediaRecord] = {}
        self._load()

    def _load(self) -> None:
        if not self.catalog_path.exists():
            return
        try:
            payload = json.loads(self.catalog_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return
        for raw in payload if isinstance(payload, list) else []:
            try:
                record = MediaRecord(**raw)
            except (TypeError, ValueError):
                continue
            self._records[record.id] = record

    def _save(self) -> None:
        temporary = self.catalog_path.with_suffix(f".tmp-{secrets.token_hex(5)}")
        temporary.write_text(json.dumps([r.to_dict() for r in self._records.values()], ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.catalog_path)

    def _record_path(self, record: MediaRecord) -> Path:
        return _real_child(self.root, record.path)

    def get(self, source_id: str) -> MediaRecord:
        try:
            record = self._records[source_id]
        except KeyError as exc:
            raise MediaNotFound(f"unknown media source: {source_id}") from exc
        path = self._record_path(record)
        if not path.is_file():
            raise MediaNotFound(f"media bytes are missing for source: {source_id}")
        if path.stat().st_size != record.bytes or sha256_file(path) != record.sha256:
            raise MediaError("media bytes changed after registration; re-ingest the source")
        return record

    def list(self, project_id: str | None = None) -> list[MediaRecord]:
        records = self._records.values()
        if project_id:
            records = (record for record in records if record.project_id == project_id)
        return sorted(records, key=lambda record: record.created_at)

    def register(
        self,
        *,
        project_id: str,
        source_path: str | Path,
        media_kind: str,
        rights: dict[str, Any],
        source_url: str = "",
        source_id: str | None = None,
        copy_into_library: bool = False,
    ) -> MediaRecord:
        project_id = _safe_project_id(project_id)
        path = Path(source_path)
        if copy_into_library:
            original = path.resolve()
            if not original.is_file():
                raise MediaNotFound("source file does not exist")
            if original.stat().st_size > MAX_SOURCE_BYTES:
                raise MediaError("source is too large")
            target_dir = self.root / project_id / "sources"
            target_dir.mkdir(parents=True, exist_ok=True)
            target = target_dir / f"{uuid.uuid4().hex}{original.suffix.lower()}"
            with original.open("rb") as source, target.open("wb") as destination:
                shutil.copyfileobj(source, destination, length=1024 * 1024)
            path = target
        else:
            path = _real_child(self.root, path)
        if not path.is_file():
            raise MediaNotFound("source file does not exist")
        size = path.stat().st_size
        if size > MAX_SOURCE_BYTES:
            raise MediaError("source is too large")
        kind = str(media_kind).strip().lower()
        if kind not in {"background", "character", "video", "image", "audio", "other"}:
            raise MediaError("unsupported media_kind")
        record = MediaRecord(
            id=source_id or f"src_{uuid.uuid4().hex}", project_id=project_id,
            path=str(path.relative_to(self.root)).replace("\\", "/"), filename=path.name,
            media_kind=kind, sha256=sha256_file(path), bytes=size,
            rights=RightsAttestation.from_value(rights).__dict__, source_url=source_url,
        )
        probe = self.probe(path)
        record.duration = probe.get("duration")
        record.width = probe.get("width")
        record.height = probe.get("height")
        record.pixel_format = probe.get("pixel_format")
        record.has_alpha = probe.get("has_alpha")
        self._records[record.id] = record
        self._save()
        return record

    def probe(self, path: Path) -> dict[str, Any]:
        """Decode metadata through ffprobe with a fixed argument vector."""
        try:
            result = subprocess.run(
                [self.ffprobe, "-v", "error", "-protocol_whitelist", "file,pipe", "-show_entries",
                 "format=duration:stream=codec_type,width,height,pix_fmt,avg_frame_rate", "-of", "json", str(path)],
                capture_output=True, text=True, timeout=20, check=False, shell=False,
            )
            payload = json.loads(result.stdout or "{}") if result.returncode == 0 else {}
        except (OSError, subprocess.TimeoutExpired, ValueError):
            payload = {}
        streams = payload.get("streams") if isinstance(payload, dict) else []
        stream = next((s for s in streams or [] if isinstance(s, dict) and s.get("codec_type") == "video"), {})
        duration: float | None
        try:
            duration = float(payload.get("format", {}).get("duration"))
        except (TypeError, ValueError):
            duration = None
        pixel_format = stream.get("pix_fmt")
        frame_rate = stream.get("avg_frame_rate") or ""
        try:
            numerator, denominator = str(frame_rate).split("/", 1)
            frame_rate_value = float(numerator) / float(denominator) if float(denominator) else None
        except (ValueError, TypeError):
            frame_rate_value = None
        return {"duration": duration, "width": stream.get("width"), "height": stream.get("height"),
                "fps": frame_rate_value, "pixel_format": pixel_format,
                "has_alpha": pixel_format in {"rgba", "bgra", "argb", "abgr", "yuva420p", "yuva422p", "yuva444p", "yuva444p10le", "rgba64le"}}

    def project_fps(self, project_id: str) -> int:
        return 30

    def composite_preview(self, *, project_id: str, background_id: str, character_id: str,
                          x: Any, y: Any, scale: Any, duration: Any,
                          ffmpeg: str | None = None, output_id: str | None = None,
                          request_hash: str | None = None) -> dict[str, Any]:
        project_id = _safe_project_id(project_id)
        bg = self.get(background_id)
        character = self.get(character_id)
        bg_rights = RightsAttestation.from_value(bg.rights)
        character_rights = RightsAttestation.from_value(character.rights)
        if not bg_rights.allows_local_edit() or not character_rights.allows_local_edit():
            raise RightsError("both sources need confirmed local-edit and transformation rights")
        bg_path, overlay_path = self._record_path(bg), self._record_path(character)
        if character.media_kind != "character" or Path(character.filename).suffix.lower() != ".png":
            raise MediaError("character overlay must be a registered PNG character source")
        character_probe = self.probe(self._record_path(character))
        if character_probe.get("has_alpha") is not True:
            raise MediaError("character PNG must contain an alpha channel")
        seconds = _number(duration, "duration", MIN_PREVIEW_SECONDS, MAX_PREVIEW_SECONDS)
        xpos = _number(x, "x", -10000, 10000)
        ypos = _number(y, "y", -10000, 10000)
        factor = _number(scale, "scale", 0.01, 10)
        if bg.duration is not None and bg_path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"} and seconds > float(bg.duration) + 0.05:
            raise MediaError("preview duration exceeds the background source duration")
        output_dir = self.root / project_id / "composites"
        output_dir.mkdir(parents=True, exist_ok=True)
        if output_id is None:
            output_id = "composite_" + uuid.uuid4().hex
        if not re.fullmatch(r"composite_[A-Za-z0-9_-]{8,80}", output_id):
            raise MediaError("composite id is invalid")
        output_path = output_dir / f"{output_id}.mp4"
        ffmpeg_bin = ffmpeg or os.environ.get("STUDIO_FFMPEG", "ffmpeg")
        is_image = bg_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        args = [ffmpeg_bin, "-hide_banner", "-loglevel", "error", "-y"]
        if is_image:
            args += ["-loop", "1"]
        args += ["-i", str(bg_path)]
        if overlay_path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
            args += ["-loop", "1"]
        args += ["-i", str(overlay_path), "-filter_complex",
                 f"[0:v]scale=ceil(iw/2)*2:ceil(ih/2)*2[bg];"
                 f"[1:v]format=rgba,scale=ceil(iw*{factor:.6f}/2)*2:ceil(ih*{factor:.6f}/2)*2[char];"
                 f"[bg][char]overlay=x={xpos:.3f}:y={ypos:.3f}:shortest=1[outv]",
                 "-map", "[outv]", "-t", f"{seconds:.3f}", "-r", str(self.project_fps(project_id)), "-an",
                 "-c:v", "libx264", "-pix_fmt", "yuv420p", str(output_path)]
        try:
            result = subprocess.run(args, capture_output=True, text=True, timeout=max(30, int(seconds * 8)), check=False, shell=False)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise MediaError("FFmpeg could not create the composite preview") from exc
        if result.returncode != 0 or not output_path.is_file() or output_path.stat().st_size == 0:
            output_path.unlink(missing_ok=True)
            raise MediaError("FFmpeg could not create the composite preview")
        output_id = output_path.stem
        output_probe = self.probe(output_path)
        metadata = {
            "id": output_id, "project_id": project_id, "kind": "composite-preview",
            "path": str(output_path.relative_to(self.root)).replace("\\", "/"),
            "sha256": sha256_file(output_path), "bytes": output_path.stat().st_size,
            "background_source_id": bg.id, "background_sha256": bg.sha256,
            "character_source_id": character.id, "character_sha256": character.sha256,
            "x": xpos, "y": ypos, "scale": factor, "duration": seconds,
            "canvas_width": output_probe.get("width"), "canvas_height": output_probe.get("height"),
            "fps": output_probe.get("fps"),
            "created_at": utc_now(), "production_eligible": False,
        }
        if request_hash:
            metadata["request_hash"] = request_hash
        output_path.with_suffix(".json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
        return metadata

    def list_composites(self, project_id: str) -> list[dict[str, Any]]:
        directory = self.root / _safe_project_id(project_id) / "composites"
        if not directory.is_dir():
            return []
        result = []
        for path in sorted(directory.glob("*.json")):
            try:
                result.append(json.loads(path.read_text(encoding="utf-8")))
            except (OSError, ValueError):
                continue
        return result

    def composite_path(self, project_id: str, composite_id: str) -> Path:
        project_id = _safe_project_id(project_id)
        if not composite_id or Path(composite_id).name != composite_id or Path(composite_id).suffix != "":
            raise MediaError("composite id is invalid")
        path = _real_child(self.root, Path(project_id) / "composites" / f"{composite_id}.mp4")
        if not path.is_file():
            raise MediaNotFound("composite preview does not exist")
        return path


class StoreMediaLibrary(MediaLibrary):
    """Adapter over the canonical StudioStore source table.

    The shared routes must use the same source ids, byte hashes and rights that
    the pre-production app exposes.  This adapter deliberately does not create
    a second source catalog or accept an arbitrary path from the browser.
    """

    def __init__(self, store: Any, root: str | Path | None = None, ffprobe: str | None = None) -> None:
        self.store = store
        self.root = Path(root or (store.root / "shared-media")).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.catalog_path = self.root / "composite-catalog.json"
        self.ffprobe = ffprobe or os.environ.get("STUDIO_FFPROBE", "ffprobe")
        self._records = {}

    def _record_from_store(self, source_id: str) -> MediaRecord:
        source = self.store.recheck_source(source_id)
        path = self.store.resolve_source_path(source_id)
        if path is None:
            raise MediaNotFound(f"media bytes are missing for source: {source_id}")
        license_name = str(source.get("license", "")).lower().replace("-", "_")
        use = {"creativecommons": "cc_by", "creative_common": "cc_by", "cc_by": "cc_by",
               "cc0": "cc0", "public_domain": "public_domain", "owned": "owned",
               "licensed": "licensed", "permission": "licensed"}.get(license_name, "unknown")
        rights = {
            "source_use": use,
            "transformation": bool(source.get("allow_transform")),
            "attribution": " | ".join(str(source.get(key, "")).strip() for key in ("creator", "source_url", "license_url", "rights_evidence")) if all(str(source.get(key, "")).strip() for key in ("creator", "source_url", "license_url", "rights_evidence")) else "",
            "basis_url": str(source.get("rights_evidence", "")),
            "confirmed": bool(source.get("rights_confirmed")),
        }
        return MediaRecord(
            id=source["id"], project_id="", path=str(path), filename=path.name,
            media_kind="character" if str(source.get("role")) == "character" else "background",
            sha256=str(source.get("original_sha256", "")), bytes=int(source.get("byte_size", path.stat().st_size)),
            rights=rights, source_url=str(source.get("source_url", "")),
            duration=source.get("duration_seconds"),
            wise_media_id=f"{source['id']}{path.suffix.lower()}",
        )

    def get(self, source_id: str) -> MediaRecord:
        return self._record_from_store(source_id)

    def _record_path(self, record: MediaRecord) -> Path:
        path = Path(record.path).resolve()
        source_root = Path(self.store.media_root).resolve()
        if path != source_root and source_root not in path.parents:
            raise MediaError("source path is outside the canonical media root")
        if path.is_symlink() or not path.is_file():
            raise MediaNotFound("media bytes are unavailable")
        return path

    def list(self, project_id: str | None = None) -> list[MediaRecord]:
        return [self._record_from_store(row["id"]) for row in self.store.rows("SELECT id FROM sources ORDER BY created_at DESC")]

    def register(self, *args: Any, **kwargs: Any) -> MediaRecord:
        raise MediaError("register sources through the canonical StudioStore upload route")

    def project_fps(self, project_id: str) -> int:
        try:
            profile = self.store.project(project_id).get("profile")
        except Exception:
            profile = None
        return 24 if profile == "newsroom" else 30


def resolve_media_url(root: Path, relative_path: str) -> Path:
    """Resolve a catalog path for FileResponse without accepting arbitrary URLs."""
    return _real_child(root, relative_path)
