"""Truthful adapter for an optional local Oxford VGG WISE service.

WISE searches an acquired local collection.  This module deliberately has no
lexical fallback: when WISE is absent or its response cannot be mapped to a
known source id and byte hash, the caller receives an explicit unavailable or
unresolved result.
"""

from __future__ import annotations

import os
import uuid
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen
import json


class WiseUnavailable(RuntimeError):
    pass


class WiseProtocolError(RuntimeError):
    pass


def _loopback_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password:
        raise ValueError("WISE_URL must be an HTTP loopback URL")
    if parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("WISE_URL must point to a loopback WISE server")
    return value.rstrip("/") + "/"


@dataclass
class WiseClient:
    base_url: str | None = None
    timeout: float = 5.0
    search_path: str | None = None

    def __post_init__(self) -> None:
        configured = self.base_url or os.environ.get("WISE_URL", "").strip()
        self.base_url = _loopback_url(configured) if configured else None
        configured_path = self.search_path or os.environ.get("WISE_SEARCH_PATH", "").strip()
        if not configured_path:
            project_name = os.environ.get("WISE_PROJECT_NAME", "").strip().strip("/")
            configured_path = f"/{project_name}/search2" if project_name else "/search2"
        self.search_path = configured_path
        if not self.search_path.startswith("/"):
            self.search_path = "/" + self.search_path
        # A shared library contains both stills and clips.  ``auto`` issues
        # one request per indexed visual modality so an image-only library is
        # useful without requiring the caller to know its composition.
        self.search_in = os.environ.get("WISE_SEARCH_IN", "auto").strip() or "auto"
        self.feature_extractor_id = os.environ.get(
            "WISE_FEATURE_EXTRACTOR_ID",
            "mlfoundations/open_clip/ViT-B-16-SigLIP2-512/webli",
        ).strip()

    @property
    def configured(self) -> bool:
        return bool(self.base_url)

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None,
                multipart_field: str | None = None,
                params: dict[str, str] | None = None) -> Any:
        if not self.base_url:
            raise WiseUnavailable("WISE_URL is not configured")
        target = urljoin(self.base_url, path.lstrip("/"))
        if params:
            target += ("&" if "?" in target else "?") + urlencode(params)
        headers = {"Accept": "application/json"}
        if multipart_field:
            boundary = "----studio-wise-" + uuid.uuid4().hex
            value = json.dumps(body or {}, ensure_ascii=False)
            data = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{multipart_field}\"\r\n"
                    "Content-Type: application/json; charset=utf-8\r\n\r\n" + value +
                    f"\r\n--{boundary}--\r\n").encode("utf-8")
            headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        else:
            data = json.dumps(body).encode("utf-8") if body is not None else None
            headers["Content-Type"] = "application/json"
        request = Request(target, data=data, method=method, headers=headers)
        try:
            with urlopen(request, timeout=self.timeout) as response:
                raw = response.read(2 * 1024 * 1024)
        except Exception as exc:  # URL errors vary across Windows/Python versions.
            raise WiseUnavailable("WISE service is unreachable") from exc
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, ValueError) as exc:
            raise WiseProtocolError("WISE returned non-JSON data") from exc

    def status(self) -> dict[str, Any]:
        if not self.base_url:
            return {"status": "offline", "configured": False, "reason": "WISE_URL is not configured"}
        for path in ("info", "health", "status", ""):
            try:
                payload = self._request("GET", path)
                return {"status": "available", "configured": True, "endpoint": path or "/", "details": _public_status(payload)}
            except (WiseUnavailable, WiseProtocolError):
                continue
        return {"status": "offline", "configured": True, "reason": "WISE service did not expose a readable JSON status endpoint"}

    def search(self, query: str, top_k: int = 10, source_index: dict[str, dict[str, Any]] | None = None,
               search_in: str | None = None) -> dict[str, Any]:
        query = str(query).strip()
        if not query or len(query) > 500:
            raise ValueError("query must contain 1-500 characters")
        if top_k < 1 or top_k > 50:
            raise ValueError("top_k must be between 1 and 50")
        requested = (search_in or self.search_in).strip().lower().replace(" ", "")
        if requested in {"auto", "both", "video,image", "image,video"}:
            modalities = ("video", "image")
        elif requested in {"video", "image", "audio", "av"}:
            modalities = (requested,)
        else:
            raise ValueError("search_in must be auto, video, image, audio, or av")
        hits: list[dict[str, Any]] = []
        successful_modalities: list[str] = []
        last_error: Exception | None = None
        for modality in modalities:
            term = {"term_id": uuid.uuid4().hex, "is_negative": False, "txt": query}
            try:
                payload = self._request(
                    "POST", self.search_path or "/search2", term, multipart_field="query_term",
                    params={"search_in": modality, "feature_extractor_id": self.feature_extractor_id,
                            "start": "0", "end": str(top_k)},
                )
                modality_hits = _response_hits(payload)
                if not isinstance(modality_hits, list):
                    raise WiseProtocolError("WISE response has no result list")
                hits.extend(item for item in modality_hits if isinstance(item, dict))
                successful_modalities.append(modality)
            except (WiseUnavailable, WiseProtocolError) as exc:
                # WISE returns a modality error when an index has no images or
                # no video. Auto search should still return the other modality.
                last_error = exc
                if len(modalities) == 1:
                    raise
        if not successful_modalities:
            raise last_error or WiseUnavailable("WISE has no searchable visual modalities")
        if len(successful_modalities) > 1:
            # The installed WISE index uses inner-product similarity, so larger
            # distances are better. Preserve provider order for unscored hits.
            def score(item: dict[str, Any]) -> float:
                try:
                    return float(item.get("score"))
                except (TypeError, ValueError):
                    return float("inf")
            hits.sort(key=score, reverse=True)
        modality = ",".join(successful_modalities)
        normalized, unresolved = [], []
        for hit in hits[:top_k]:
            if not isinstance(hit, dict):
                continue
            item = _normalize_hit(hit)
            source = _find_source(item["source_id"], source_index or {})
            hash_matches = bool(source and item["sha256"] and item["sha256"].lower() == str(source.get("sha256", "")).lower())
            id_mapping_matches = bool(source and not item["sha256"] and item["source_id"] in {
                str(source.get("wise_media_id", "")), str(source.get("media_id", "")),
                str(source.get("wise_source", "")), str(source.get("path", "")),
                str(source.get("filename", "")), str(source.get("id", "")),
            })
            if not source or not (hash_matches or id_mapping_matches):
                unresolved.append({**item, "status": "unresolved-source-hash"})
                continue
            raw_start, raw_end = item["start"], item["end"]
            duration = source.get("duration", source.get("duration_seconds"))
            if duration is not None:
                try:
                    duration = max(0.0, float(duration))
                    item["start"] = min(raw_start, duration)
                    item["end"] = min(max(raw_end, item["start"]), duration)
                except (TypeError, ValueError):
                    duration = None
            normalized.append({**item, "source_id": source.get("id", source.get("source_id", item["source_id"])),
                               "sha256": source.get("sha256", item["sha256"]),
                               "raw_start": raw_start, "raw_end": raw_end,
                               "timestamp_clamped": bool(duration is not None and (raw_start != item["start"] or raw_end != item["end"])),
                               "source_duration": duration,
                               "status": "candidate", "mapping_basis": "known-source-id-and-hash"})
        return {"status": "available", "query": query, "search_in": modality, "results": normalized, "unresolved": unresolved}


def _normalize_hit(hit: dict[str, Any]) -> dict[str, Any]:
    source_id = str(hit.get("source_id", hit.get("asset_id", hit.get("id", hit.get("video", ""))))).strip()
    sha256 = str(hit.get("sha256", hit.get("source_sha256", hit.get("hash", "")))).strip()
    start = hit.get("start", hit.get("start_time", hit.get("ts", hit.get("timestamp", 0))))
    end = hit.get("end", hit.get("end_time", hit.get("te", hit.get("timestamp_end", start))))
    try:
        start = float(start)
        end = float(end)
    except (TypeError, ValueError):
        start, end = 0.0, 0.0
    return {
        "source_id": source_id, "sha256": sha256, "start": max(0.0, start),
        "end": max(0.0, end), "score": hit.get("score", hit.get("similarity")),
        "thumbnail_ts": hit.get("thumbnail_ts"),
        "label": str(hit.get("label", hit.get("caption", ""))),
    }


def _response_hits(payload: Any) -> list[dict[str, Any]]:
    """Flatten the official WISE SearchResponse video windows."""
    if not isinstance(payload, dict):
        return payload if isinstance(payload, list) else []
    direct = payload.get("results", payload.get("hits"))
    if isinstance(direct, list):
        return direct
    video = payload.get("video_results")
    if not isinstance(video, dict):
        image = payload.get("image_results")
        if not isinstance(image, dict):
            return []
        output = []
        images = image.get("images", {}) or {}
        for vector in image.get("vectors", []) or []:
            if not isinstance(vector, dict):
                continue
            media_id = vector.get("media_id", "")
            info = images.get(media_id, images.get(str(media_id), {})) or {}
            output.append({"source_id": info.get("filename", "") or media_id,
                           "sha256": vector.get("sha256", ""), "start": 0, "end": 0,
                           "score": vector.get("distance", vector.get("score")),
                           "label": info.get("filename", ""), "thumbnail_ts": None})
        return output
    windows = video.get("merged_windows") or video.get("unmerged_windows") or []
    output = []
    for segment in windows:
        if not isinstance(segment, dict):
            continue
        media_id = segment.get("media_id", "")
        videos = video.get("videos", {}) or {}
        video_info = videos.get(media_id, videos.get(str(media_id), {})) or {}
        output.append({
            "source_id": video_info.get("filename", "") or media_id,
            "sha256": segment.get("sha256", ""),
            "ts": segment.get("ts", 0), "te": segment.get("te", 0),
            "thumbnail_ts": segment.get("thumbnail_ts"),
            "score": segment.get("distance", segment.get("score")),
            "label": video_info.get("filename", ""),
        })
    return output


def _find_source(source_key: str, source_index: dict[str, dict[str, Any]]) -> dict[str, Any] | None:
    for source_id, source in source_index.items():
        keys = {
            str(source_id), str(source.get("id", source.get("source_id", ""))), str(source.get("wise_media_id", "")),
            str(source.get("media_id", "")), str(source.get("wise_source", "")),
            str(source.get("path", "")), str(source.get("filename", "")),
        }
        if source_key and source_key in keys:
            return source
    return None


def _public_status(payload: Any) -> Any:
    if isinstance(payload, dict):
        # WISE status is useful for operator diagnostics, but never echo tokens.
        blocked = {"token", "api_key", "apikey", "authorization", "secret", "password"}
        return {str(k): v for k, v in payload.items() if str(k).lower() not in blocked}
    return payload
