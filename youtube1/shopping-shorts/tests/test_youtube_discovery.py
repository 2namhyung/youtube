from datetime import datetime, timedelta, timezone

import httpx
import pytest

from apps.api.store import Gate
from packages.contracts.models import YouTubeDiscoveryRequest
from tests.helpers import Studio
from workers.discovery.youtube import collect, PROVIDER


def _video(video_id, channel_id, published, views, title="#shorts 수납함 사용법"):
    return {"id": video_id, "snippet": {"channelId": channel_id, "publishedAt": published, "title": title,
            "description": "demo #shorts", "tags": ["shorts", "demo"]},
            "contentDetails": {"duration": "PT35S"}, "statistics": {"viewCount": str(views)},
            "paidProductPlacementDetails": {"hasPaidProductPlacement": False}, "status": {"privacyStatus": "public"}}


def test_youtube_collector_uses_public_api_without_recording_key():
    observed = datetime(2026, 9, 22, 12, tzinfo=timezone.utc)
    candidate_time = (observed - timedelta(hours=72)).isoformat().replace("+00:00", "Z")
    ids = ["candidate", *[f"old{i}" for i in range(10)]]
    videos = {"candidate": _video("candidate", "channel", candidate_time, 50000)}
    for i in range(10):
        published = (observed - timedelta(days=5 + i)).isoformat().replace("+00:00", "Z")
        videos[f"old{i}"] = _video(f"old{i}", "channel", published, 1000)

    def handler(request):
        assert request.url.params["key"] == "SECRET_KEY"
        if request.url.path.endswith("/search"):
            if "channelId" not in request.url.params:
                assert request.url.params["regionCode"] == "KR"
                assert request.url.params["relevanceLanguage"] == "ko"
            selected = ids[1:] if "channelId" in request.url.params else ["candidate"]
            return httpx.Response(200, json={"items": [{"id": {"videoId": value}, "snippet": {}} for value in selected]})
        selected = request.url.params["id"].split(",")
        return httpx.Response(200, json={"items": [videos[value] for value in selected]})

    request = YouTubeDiscoveryRequest(expected_revision=1, query="수납함 #shorts", age_hours=72)
    result = collect("SECRET_KEY", request, transport=httpx.MockTransport(handler), observed_at=observed)
    assert result["candidate_id"] == "candidate"
    assert len(result["snapshots"]) == 11
    assert result["snapshots"][0]["shorts_status"] == "probable"
    assert result["snapshots"][0]["commerce_type"] == "unknown"
    assert "SECRET_KEY" not in str(result["evidence"])
    assert result["evidence"]["api_key_recorded"] is False


def test_youtube_discovery_endpoint_records_evidence_and_runs_stage(tmp_path, monkeypatch):
    studio = Studio(tmp_path / "store")
    project = studio.create(mode="production", name="YouTube API 실제 수집 계약 테스트")
    observed = datetime(2026, 9, 22, 12, tzinfo=timezone.utc).isoformat()

    def fake_collect(api_key, body, **kwargs):
        return {"candidate_id": "candidate", "channel_id": "channel", "age_hours": 72,
                "observed_at": observed,
                "snapshots": [{"video_id": "candidate", "channel_id": "channel",
                    "published_at": "2026-09-19T12:00:00+00:00", "observed_at": observed, "views": 50000,
                    "provider": PROVIDER, "definition": "public-statistics-live-v1", "shorts_status": "confirmed",
                    "commerce_type": "demo", "shopping_tag_status": "unknown", "title": "demo #shorts", "duration": "PT30S"}],
                "evidence": {"schema": "youtube-discovery-collection-v1", "api_key_recorded": False}}

    monkeypatch.setattr("apps.api.main.collect_youtube", fake_collect)
    response = studio.post(f"/v1/projects/{studio.pid}/youtube-discovery", {
        "expected_revision": project["revision"], "query": "수납함 #shorts", "candidate_id": None,
        "age_hours": 72, "region_code": "KR", "max_results": 50,
    }, 202)
    studio.pipeline.execute(response["job_id"])
    job = studio.pipeline.job(response["job_id"])
    assert job["state"] == "SUCCEEDED", job["error"]
    result = studio.store.get(studio.store.project(studio.pid)["state"]["discovery_id"], "outlier")
    assert result["data"]["result"]["status"] == "INSUFFICIENT_BASELINE"
    assert studio.store.list("youtube-observation", studio.pid)
    assert studio.store.list("authorization", studio.pid)[0]["data"]["providers"] == [PROVIDER]
    receipt = studio.store.list("receipt", studio.pid)[0]
    assert receipt["data"]["surface"] == "youtube-data-api"
    studio.store.close()


def test_youtube_key_is_required():
    request = YouTubeDiscoveryRequest(expected_revision=1, query="storage shorts")
    with pytest.raises(Gate, match="YOUTUBE_API_KEY"):
        collect("", request)
