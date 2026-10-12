"""YouTube Data API v3 collector for stage 1 public-video observations."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx

from apps.api.store import Gate
from scripts.discover_shopping_channels import YouTube


API_ROOT = "https://www.googleapis.com/youtube/v3"
PROVIDER = "youtube-data-api-v3"
DEFINITION = "public-statistics-live-v1"


def _duration_seconds(value: str) -> int:
    match = re.fullmatch(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value or "")
    if not match:
        return 0
    days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


def _shorts_status(item: dict[str, Any]) -> str:
    seconds = _duration_seconds(item.get("contentDetails", {}).get("duration", ""))
    if not 0 < seconds <= 180:
        return "not_short"
    # The Data API has no Shorts boolean. Duration is only a candidate signal;
    # semantic confirmation stays with a separate browser/Luna observation.
    return "probable"


def _get(client: YouTube, endpoint: str, params: dict[str, Any], api_key: str) -> dict[str, Any]:
    try:
        return client.get(endpoint, params, bucket="search" if endpoint == "search" else "read")
    except RuntimeError as exc:
        raise Gate("YOUTUBE_API_ERROR", str(exc), 502) from None


def _video_batches(client: httpx.Client, ids: list[str], api_key: str, raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    unique = list(dict.fromkeys(video_id for video_id in ids if video_id))
    for offset in range(0, len(unique), 50):
        response = _get(client, "videos", {
            "part": "snippet,contentDetails,statistics,paidProductPlacementDetails,status",
            "id": ",".join(unique[offset:offset + 50]),
            "maxResults": 50,
        }, api_key)
        raw.append({"endpoint": "videos.list", "response": response})
        items.extend(response.get("items", []))
    return items


def collect(api_key: str, request: Any, *, transport=None, observed_at: datetime | None = None,
            backup_key="", state_path=None) -> dict[str, Any]:
    if not api_key:
        raise Gate("YOUTUBE_API_KEY_MISSING", "Set YOUTUBE_API_KEY before running YouTube discovery", 503)
    observed = (observed_at or datetime.now(timezone.utc)).astimezone(timezone.utc)
    raw: list[dict[str, Any]] = []
    with YouTube(api_key, 1000, 100, 1000, transport=transport, backup_key=backup_key, state_path=state_path) as client:
        search = _get(client, "search", {
            "part": "snippet", "q": request.query, "type": "video", "order": "date",
            "regionCode": request.region_code,
            "relevanceLanguage": "ko" if request.region_code == "KR" else None,
            "maxResults": request.max_results,
        }, api_key)
        raw.append({"endpoint": "search.list", "response": search})
        search_ids = [item.get("id", {}).get("videoId") for item in search.get("items", [])]
        if request.candidate_id:
            search_ids.insert(0, request.candidate_id)
        initial = _video_batches(client, search_ids, api_key, raw)
        available = [item for item in initial if item.get("snippet", {}).get("publishedAt") and item.get("statistics", {}).get("viewCount") is not None]
        if not available:
            raise Gate("YOUTUBE_NO_RESULTS", "No public videos with statistics matched the query", 422)
        by_id = {item["id"]: item for item in available}
        if request.candidate_id:
            candidate = by_id.get(request.candidate_id)
            if not candidate:
                raise Gate("YOUTUBE_CANDIDATE_UNAVAILABLE", "Candidate video is unavailable or has no public statistics", 422)
        else:
            def age_distance(item):
                published = datetime.fromisoformat(item["snippet"]["publishedAt"].replace("Z", "+00:00"))
                return abs((observed - published).total_seconds() / 3600 - request.age_hours)
            candidate = min(available, key=age_distance)

        candidate_published = datetime.fromisoformat(candidate["snippet"]["publishedAt"].replace("Z", "+00:00"))
        channel_id = candidate["snippet"]["channelId"]
        channel_search = _get(client, "search", {
            "part": "snippet", "channelId": channel_id, "type": "video", "order": "date",
            "publishedBefore": candidate_published.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "maxResults": request.max_results,
        }, api_key)
        raw.append({"endpoint": "search.list", "response": channel_search})
        cohort_ids = [item.get("id", {}).get("videoId") for item in channel_search.get("items", [])]
        cohort = _video_batches(client, cohort_ids, api_key, raw)
        items = [candidate, *cohort]

    normalized = []
    for item in items:
        snippet, statistics = item.get("snippet", {}), item.get("statistics", {})
        if not snippet.get("publishedAt") or statistics.get("viewCount") is None:
            continue
        normalized.append({
            "video_id": item["id"],
            "channel_id": snippet["channelId"],
            "published_at": datetime.fromisoformat(snippet["publishedAt"].replace("Z", "+00:00")).isoformat(),
            "observed_at": observed.isoformat(),
            "views": int(statistics["viewCount"]),
            "provider": PROVIDER,
            "definition": DEFINITION,
            "shorts_status": _shorts_status(item),
            "commerce_type": "unknown",
            "shopping_tag_status": "unknown",
            "title": snippet.get("title", ""),
            "duration": item.get("contentDetails", {}).get("duration", ""),
        })
    if not normalized or normalized[0]["video_id"] != candidate["id"]:
        raise Gate("YOUTUBE_CANDIDATE_UNAVAILABLE", "Candidate could not be normalized", 422)
    return {
        "candidate_id": candidate["id"],
        "channel_id": channel_id,
        "age_hours": request.age_hours,
        "observed_at": observed.isoformat(),
        "snapshots": normalized,
        "evidence": {
            "schema": "youtube-discovery-collection-v1",
            "provider": PROVIDER,
            "definition": DEFINITION,
            "request": request.model_dump(mode="json", exclude={"expected_revision"}),
            "observed_at": observed.isoformat(),
            "expires_at": (observed + timedelta(days=30)).isoformat(),
            "responses": raw,
            "normalized": normalized,
            "api_key_recorded": False,
            "quota_note": "Two search.list calls plus batched videos.list calls",
        },
    }
