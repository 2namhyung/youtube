from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.media import MediaLibrary, MediaError, RightsError
from backend.wise import WiseClient, WiseUnavailable, _response_hits
import backend.media_routes as media_routes
from backend.media_routes import create_router


def _make_png(path: Path) -> None:
    from PIL import Image
    Image.new("RGBA", (2, 2), (255, 0, 0, 128)).save(path, format="PNG")


def _rights(**overrides):
    value = {"source_use": "owned", "transformation": "allowed", "confirmed": True}
    value.update(overrides)
    return value


def test_rights_gate_rejects_cc_candidate(tmp_path: Path):
    background = tmp_path / "bg.png"
    character = tmp_path / "character.png"
    _make_png(background)
    _make_png(character)
    library = MediaLibrary(tmp_path / "library")
    bg = library.register(project_id="p1", source_path=background, media_kind="background", rights=_rights(), copy_into_library=True)
    ch = library.register(project_id="p1", source_path=character, media_kind="character", rights={"source_use": "candidate-unconfirmed", "transformation": "allowed", "confirmed": False}, copy_into_library=True)
    with pytest.raises(RightsError):
        library.composite_preview(project_id="p1", background_id=bg.id, character_id=ch.id, x=0, y=0, scale=1, duration=1)


def test_path_traversal_is_rejected(tmp_path: Path):
    library = MediaLibrary(tmp_path / "library")
    with pytest.raises(MediaError):
        library.register(project_id="p1", source_path="..\\secret.mp4", media_kind="video", rights=_rights())
    with pytest.raises(MediaError):
        library.list_composites("..\\outside")


def test_composite_preview_decodes(tmp_path: Path):
    background = tmp_path / "bg.png"
    character = tmp_path / "character.png"
    _make_png(background)
    _make_png(character)
    library = MediaLibrary(tmp_path / "library")
    bg = library.register(project_id="p1", source_path=background, media_kind="background", rights=_rights(), copy_into_library=True)
    ch = library.register(project_id="p1", source_path=character, media_kind="character", rights=_rights(), copy_into_library=True)
    result = library.composite_preview(project_id="p1", background_id=bg.id, character_id=ch.id, x=10, y=12, scale=2, duration=0.5)
    output = library.composite_path("p1", result["id"])
    probe = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "json", str(output)], capture_output=True, text=True, check=True)
    duration = float(json.loads(probe.stdout)["format"]["duration"])
    assert duration == pytest.approx(0.5, abs=0.08)
    assert result["production_eligible"] is False


def test_wise_is_explicitly_offline_without_config(monkeypatch):
    monkeypatch.delenv("WISE_URL", raising=False)
    result = WiseClient().status()
    assert result["status"] == "offline"
    assert result["configured"] is False


def test_youtube_auth_failure_uses_secondary_key_only(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "primary")
    monkeypatch.setenv("YOUTUBE_API_KEY_2", "secondary")
    calls = []

    def fake_request(key, params):
        calls.append(key)
        if key == "primary":
            return None, "keyInvalid"
        return {"items": [], "nextPageToken": ""}, None

    monkeypatch.setattr(media_routes, "_youtube_api_request", fake_request)
    assert media_routes._youtube_search("street", 2)["status"] == "available"
    assert calls == ["primary", "secondary"]


def test_youtube_quota_does_not_rotate_key(monkeypatch):
    monkeypatch.setenv("YOUTUBE_API_KEY", "primary")
    monkeypatch.setenv("YOUTUBE_API_KEY_2", "secondary")
    calls = []

    def fake_request(key, params):
        calls.append(key)
        return None, "quotaExceeded"

    monkeypatch.setattr(media_routes, "_youtube_api_request", fake_request)
    result = media_routes._youtube_search("street", 2)
    assert result["status"] == "quota"
    assert calls == ["primary"]


def test_wise_response_preserves_provider_timestamps():
    hits = _response_hits({"video_results": {"merged_windows": [
        {"media_id": "source-1", "ts": 12.25, "te": 16.5, "distance": 0.2},
    ], "videos": {"source-1": {"filename": "original.mp4"}}}})
    assert hits == [{"source_id": "original.mp4", "sha256": "", "ts": 12.25, "te": 16.5,
                     "thumbnail_ts": None, "score": 0.2, "label": "original.mp4"}]


def test_wise_numeric_media_id_uses_video_filename():
    hits = _response_hits({"video_results": {"merged_windows": [{"media_id": 2, "ts": 0, "te": 5.5}], "videos": {"2": {"filename": "source-1.mp4"}}}})
    assert hits[0]["source_id"] == "source-1.mp4"


def test_wise_auto_search_falls_back_to_image_only_index(monkeypatch):
    client = WiseClient("http://127.0.0.1:9672")
    modalities = []

    def fake_request(method, path, body=None, multipart_field=None, params=None):
        modalities.append(params["search_in"])
        if params["search_in"] == "video":
            raise WiseUnavailable("no video index")
        return {"image_results": {
            "vectors": [{"media_id": "1", "distance": 0.1}],
            "images": {"1": {"filename": "still.png"}},
        }}

    monkeypatch.setattr(client, "_request", fake_request)
    result = client.search("street", 5, {
        "source-1": {"id": "source-1", "wise_media_id": "still.png", "sha256": "abc"},
    })
    assert modalities == ["video", "image"]
    assert result["search_in"] == "image"
    assert result["results"][0]["source_id"] == "source-1"


def test_wise_search_route_supports_image_only_library(tmp_path: Path, monkeypatch):
    image = tmp_path / "still.png"
    _make_png(image)
    library = MediaLibrary(tmp_path / "library")
    record = library.register(project_id="p1", source_path=image, media_kind="image",
                              rights=_rights(), copy_into_library=True)
    client = WiseClient("http://127.0.0.1:9672")

    def fake_request(method, path, body=None, multipart_field=None, params=None):
        if params["search_in"] == "video":
            raise WiseUnavailable("no video index")
        return {"image_results": {"vectors": [{"media_id": "1", "distance": 0.9}],
                                   "images": {"1": {"filename": record.filename}}}}

    monkeypatch.setattr(client, "_request", fake_request)
    app = FastAPI()
    app.include_router(create_router(library, client))
    response = TestClient(app).post("/api/studio/wise/search", json={"query": "street", "top_k": 5})
    assert response.status_code == 200
    payload = response.json()
    assert payload["search_in"] == "image"
    assert payload["results"][0]["source_id"] == record.id


def test_wise_search_maps_staged_media_id_to_known_hash(monkeypatch):
    client = WiseClient("http://127.0.0.1:9670/demo")
    captured = {}

    def fake_request(method, path, body=None, multipart_field=None, params=None):
        captured.update({"method": method, "path": path, "body": body, "multipart_field": multipart_field, "params": params})
        return {"video_results": {"merged_windows": [{"media_id": "source-1.mp4", "ts": 2, "te": 5, "distance": 0.1}], "videos": {}}}

    monkeypatch.setattr(client, "_request", fake_request)
    result = client.search("a hallway", 4, {"source-1": {"id": "source-1", "wise_media_id": "source-1.mp4", "sha256": "abc", "duration": 3.0}})
    assert result["results"][0]["source_id"] == "source-1"
    assert result["results"][0]["sha256"] == "abc"
    assert result["results"][0]["start"] == 2
    assert result["results"][0]["end"] == 3
    assert result["results"][0]["raw_end"] == 5
    assert result["results"][0]["timestamp_clamped"] is True
    assert captured["multipart_field"] == "query_term"
    assert captured["body"]["is_negative"] is False
