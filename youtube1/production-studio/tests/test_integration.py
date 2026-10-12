from __future__ import annotations

import base64
import binascii
import hashlib
import io
import json
import shutil
import struct
import subprocess
import zipfile
import zlib
from pathlib import Path

from fastapi.testclient import TestClient
import pytest

from backend.main import create_app


# A real RGBA PNG (one opaque pixel) keeps this test independent of checked-in
# media and exercises the same upload and FFmpeg paths as the browser.
def _rgba_png(rgba: tuple[int, int, int, int]) -> bytes:
    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", binascii.crc32(kind + data) & 0xFFFFFFFF)

    scanline = b"\x00" + bytes(rgba)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(scanline))
        + chunk(b"IEND", b"")
    )


PNG = _rgba_png((240, 240, 240, 255))
CHARACTER_PNG = _rgba_png((220, 40, 40, 180))


def _headers(client: TestClient, key: str) -> dict[str, str]:
    token = client.get("/api/studio/session").json()["token"]
    return {"X-Studio-Token": token, "Idempotency-Key": key}


def _upload(client: TestClient, name: str, role: str, key: str) -> dict:
    metadata = {
        "title": name,
        "license": "owned",
        "role": role,
        "rights_confirmed": True,
        "allow_transform": True,
        "allow_imagegen": False,
        "allow_omni": False,
    }
    payload = CHARACTER_PNG if role == "character" else PNG
    response = client.post(
        "/api/studio/sources",
        files={"file": (f"{name}.png", io.BytesIO(payload), "image/png")},
        data={"metadata": json.dumps(metadata)},
        headers=_headers(client, key),
    )
    assert response.status_code == 201, response.text
    return response.json()


def _probe(path: Path) -> dict:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_name,width,height,r_frame_rate",
            "-of", "json", str(path),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def test_default_main_upload_composite_decodes_for_both_profiles(tmp_path: Path):
    with TestClient(create_app(tmp_path)) as client:
        background = _upload(client, "background", "context", "background")
        character = _upload(client, "character", "character", "character")

        for profile, project_key, expected_fps in (
            ("newsroom", "newsroom", "24/1"),
            ("shopping", "shopping", "30/1"),
        ):
            project = client.post(
                "/api/studio/projects",
                json={"name": profile, "profile": profile},
                headers=_headers(client, project_key),
            )
            assert project.status_code == 201, project.text
            project_id = project.json()["id"]
            missing_revision = client.post(
                f"/api/studio/projects/{project_id}/composite",
                json={
                    "background_source_id": background["id"],
                    "character_source_id": character["id"],
                    "x": 0, "y": 0, "scale": 1, "duration": 0.2,
                },
                headers=_headers(client, f"composite-missing-{profile}"),
            )
            assert missing_revision.status_code == 400
            assert client.get(f"/api/studio/projects/{project_id}").json()["revision"] == 1
            assert client.get(f"/api/studio/projects/{project_id}/composites").json()["items"] == []
            response = client.post(
                f"/api/studio/projects/{project_id}/composite",
                json={
                        "background_source_id": background["id"],
                        "character_source_id": character["id"],
                        "expected_revision": 1,
                    "x": 0,
                    "y": 0,
                    "scale": 1,
                    "duration": 0.2,
                },
                headers=_headers(client, f"composite-{profile}"),
            )
            assert response.status_code == 200, response.text
            composite = response.json()
            assert composite["bytes"] > 0
            assert composite["background_sha256"] == background["original_sha256"]
            assert composite["character_sha256"] == character["original_sha256"]
            assert composite["project_revision"] == 2
            replay = client.post(
                f"/api/studio/projects/{project_id}/composite",
                json={
                    "background_source_id": background["id"],
                    "character_source_id": character["id"],
                    "expected_revision": 1,
                    "x": 0, "y": 0, "scale": 1, "duration": 0.2,
                },
                headers=_headers(client, f"composite-{profile}"),
            )
            assert replay.status_code == 200
            assert replay.json()["id"] == composite["id"]
            handoff = client.get(f"/api/studio/projects/{project_id}/handoff")
            assert handoff.status_code == 200
            assert handoff.json()["media_artifacts"][0]["sha256"] == composite["sha256"]

            file_response = client.get(
                f"/api/studio/projects/{project_id}/composites/{composite['id']}/file"
            )
            assert file_response.status_code == 200
            output = tmp_path / f"{profile}.mp4"
            output.write_bytes(file_response.content)
            probe = _probe(output)
            stream = probe["streams"][0]
            assert stream["codec_name"] == "h264"
            assert stream["width"] % 2 == 0 and stream["height"] % 2 == 0
            assert stream["r_frame_rate"] == expected_fps
            assert float(probe["format"]["duration"]) == pytest.approx(0.2, abs=0.03)


def test_restart_cas_stale_analysis_and_export_provenance(tmp_path: Path):
    with TestClient(create_app(tmp_path)) as client:
        source = _upload(client, "source", "context", "source")
        created = client.post(
            "/api/studio/projects",
            json={"name": "persistent", "profile": "newsroom"},
            headers=_headers(client, "project"),
        ).json()
        project_id = created["id"]
        analyzed = client.post(
            f"/api/studio/projects/{project_id}/analyze",
            json={"script": "첫 문장. 둘째 문장.", "expected_revision": 1},
            headers=_headers(client, "analysis"),
        )
        assert analyzed.status_code == 200, analyzed.text
        shot_id = analyzed.json()["project"]["state"]["shot_ids"][0]
        attached = client.post(
            f"/api/studio/projects/{project_id}/shots/{shot_id}",
            json={"expected_revision": 2, "source_id": source["id"], "visual_mode": "real-2d"},
            headers=_headers(client, "attach"),
        )
        assert attached.status_code == 200, attached.text
        conformed = client.post(
            f"/api/studio/projects/{project_id}/conform",
            json={
                "expected_revision": 3,
                "text": "수정된 문장.",
                "change_note": "표현 수정",
                "facts_confirmed": True,
            },
            headers=_headers(client, "conform"),
        )
        assert conformed.status_code == 200, conformed.text
        stale = client.post(
            f"/api/studio/projects/{project_id}/shots/{shot_id}",
            json={"expected_revision": 4, "source_id": source["id"], "visual_mode": "real-2d"},
            headers=_headers(client, "stale-shot"),
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "STALE_SHOT"

        archive = client.get(f"/api/studio/projects/{project_id}/export")
        assert archive.status_code == 200
        with zipfile.ZipFile(io.BytesIO(archive.content)) as bundle:
            assert {"project.json", "handoff.json", "attribution.md", "SHA256SUMS.json"} == set(bundle.namelist())
            handoff = client.get(f"/api/studio/projects/{project_id}/handoff")
            assert json.loads(bundle.read("handoff.json")) == handoff.json()
            checksums = json.loads(bundle.read("SHA256SUMS.json"))
            assert set(checksums) == {"project.json", "handoff.json", "attribution.md"}
            for name, sha in checksums.items():
                assert hashlib.sha256(bundle.read(name)).hexdigest() == sha
            assert source["original_sha256"] in bundle.read("project.json").decode()

    with TestClient(create_app(tmp_path)) as restarted:
        restored = restarted.get(f"/api/studio/projects/{project_id}")
        assert restored.status_code == 200
        assert restored.json()["id"] == project_id
        assert restored.json()["revision"] == 4
