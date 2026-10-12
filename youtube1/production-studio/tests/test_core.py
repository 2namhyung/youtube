import io
import hashlib
import json
import zipfile
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
from PIL import Image

from backend.app import create_app
from backend.main import create_app as create_media_app
from backend.integration import record_media_artifact
from fastapi import HTTPException


def client(tmp_path):
    app = create_app(tmp_path)
    return TestClient(app)


def auth(c, key="k1"):
    token = c.get("/api/studio/session").json()["token"]
    return {"X-Studio-Token": token, "Idempotency-Key": key}


def test_revision_cas_analysis_and_shot_attachment(tmp_path):
    c = client(tmp_path)
    created = c.post("/api/studio/projects", json={"name": "테스트 사건", "profile": "newsroom"}, headers=auth(c)).json()
    replay = c.post("/api/studio/projects", json={"name": "테스트 사건", "profile": "newsroom"}, headers=auth(c))
    assert replay.status_code == 201 and replay.json()["id"] == created["id"]
    conflict_key = c.post("/api/studio/projects", json={"name": "다른 내용", "profile": "newsroom"}, headers=auth(c)).status_code
    assert conflict_key == 409
    assert created["revision"] == 1
    analyzed = c.post("/api/studio/projects/%s/analyze" % created["id"], json={"script": "문이 열렸다. 사람이 들어왔다.", "expected_revision": 1}, headers=auth(c, "a1"))
    assert analyzed.status_code == 200
    data = analyzed.json()
    assert [u["text"] for u in data["analysis"]["units"]] == ["문이 열렸다.", "사람이 들어왔다."]
    assert all(u["suggestion_status"] == "unverified" for u in data["analysis"]["units"])
    stale = c.post("/api/studio/projects/%s/analyze" % created["id"], json={"script": "다른 문장.", "expected_revision": 1}, headers=auth(c, "a2"))
    assert stale.status_code == 409

    png = b"\x89PNG\r\n\x1a\n" + b"fixture-png"
    source = c.post("/api/studio/sources", files={"file": ("clip.png", io.BytesIO(png), "image/png")}, data={"metadata": json.dumps({"title": "CC source", "license": "CC-BY", "role": "context", "source_url": "https://example.test/source"})}, headers=auth(c, "s1"))
    assert source.status_code == 201
    assert source.json()["byte_size"] == len(png)
    assert source.json()["original_sha256"]
    second = c.post("/api/studio/projects", json={"name": "두 번째", "profile": "shopping"}, headers=auth(c, "p2"))
    assert second.status_code == 201
    shot_id = data["project"]["state"]["shot_ids"][0]
    attached = c.post("/api/studio/projects/%s/shots/%s" % (created["id"], shot_id), json={"expected_revision": 2, "source_id": source.json()["id"], "in_seconds": 0, "out_seconds": 1, "visual_mode": "real-2d"}, headers=auth(c, "s2"))
    assert attached.status_code == 200
    assert attached.json()["shot"]["source_status"] == "unverified"
    handoff = c.get(f"/api/studio/projects/{created['id']}/handoff").json()
    assert not any(item["code"] == "CONTEXT_NOT_EVIDENCE" for item in handoff["blockers"])


def test_origin_preflight_and_handoff_export(tmp_path):
    c = client(tmp_path)
    denied = c.options("/api/studio/health", headers={"Origin": "https://evil.test", "Access-Control-Request-Method": "POST"})
    assert denied.status_code == 403
    allowed = c.options("/api/studio/health", headers={"Origin": "http://localhost:5174", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "x-studio-token", "Access-Control-Request-Private-Network": "true"})
    assert allowed.status_code == 204
    assert allowed.headers["Access-Control-Allow-Private-Network"] == "true"

    project = c.post("/api/studio/projects", json={"name": "export", "profile": "shopping", "script": "초안"}, headers=auth(c, "p1")).json()
    packet = c.get(f"/api/studio/projects/{project['id']}/handoff")
    assert packet.status_code == 200
    assert packet.json()["path_free"] is True
    assert packet.json()["publication"] is False
    archive = c.get(f"/api/studio/projects/{project['id']}/export")
    assert archive.status_code == 200
    with zipfile.ZipFile(io.BytesIO(archive.content)) as zf:
        assert set(zf.namelist()) == {"project.json", "handoff.json", "attribution.md", "SHA256SUMS.json"}
        assert json.loads(zf.read("handoff.json")) == packet.json()
        checksums = json.loads(zf.read("SHA256SUMS.json"))
        assert set(checksums) == {"project.json", "handoff.json", "attribution.md"}
        for name, sha in checksums.items():
            assert hashlib.sha256(zf.read(name)).hexdigest() == sha
        checksums = json.loads(zf.read("SHA256SUMS.json"))


def test_conform_retains_before_after_and_invalidates_downstream(tmp_path):
    c = client(tmp_path)
    project = c.post("/api/studio/projects", json={"name": "conform", "profile": "newsroom", "script": "기존 문장"}, headers=auth(c, "c1")).json()
    result = c.post(f"/api/studio/projects/{project['id']}/conform", json={"expected_revision": 1, "text": "수정 문장", "change_note": "표현 정리", "facts_confirmed": True}, headers=auth(c, "c2"))
    assert result.status_code == 200
    current = result.json()["project"]
    assert current["script"] == "수정 문장"
    assert current["state"]["final_voice_authority_unchanged"] is True
    assert current["conforms"][0]["before_text"] == "기존 문장"
    assert current["conforms"][0]["after_text"] == "수정 문장"
    assert result.json()["conform"]["operator_attested"] is True


def test_strict_boolean_and_source_drift_are_fail_closed(tmp_path):
    c = client(tmp_path)
    invalid = c.post("/api/studio/sources", json={"title": "bad", "license": "CC-BY", "rights_confirmed": "false"}, headers=auth(c, "bad-bool"))
    assert invalid.status_code == 422
    source = c.post("/api/studio/sources", files={"file": ("frame.png", io.BytesIO(b"\x89PNG\r\n\x1a\nvalid"), "image/png")}, data={"metadata": json.dumps({"title": "frame", "license": "owned", "rights_confirmed": True})}, headers=auth(c, "drift-source"))
    assert source.status_code == 201
    path = tmp_path / "sources" / source.json()["id"] / "original.png"
    path.write_bytes(b"\x89PNG\r\n\x1a\nchanged")
    project = c.post("/api/studio/projects", json={"name": "drift", "profile": "newsroom"}, headers=auth(c, "drift-project")).json()
    analyzed = c.post(f"/api/studio/projects/{project['id']}/analyze", json={"script": "한 장면.", "expected_revision": 1}, headers=auth(c, "drift-analyze")).json()
    shot = analyzed["project"]["state"]["shot_ids"][0]
    attached = c.post(f"/api/studio/projects/{project['id']}/shots/{shot}", json={"expected_revision": 2, "source_id": source.json()["id"], "visual_mode": "source"}, headers=auth(c, "drift-attach"))
    assert attached.status_code == 409


def test_cc_by_item_fields_and_video_interval_block_handoff(tmp_path):
    c = client(tmp_path)
    project = c.post("/api/studio/projects", json={"name": "rights", "profile": "newsroom"}, headers=auth(c, "rights-project")).json()
    analyzed = c.post(f"/api/studio/projects/{project['id']}/analyze", json={"script": "장면 하나.", "expected_revision": 1}, headers=auth(c, "rights-analyze")).json()
    source = c.post("/api/studio/sources", files={"file": ("frame.png", io.BytesIO(b"\x89PNG\r\n\x1a\nframe"), "image/png")}, data={"metadata": json.dumps({"title": "incomplete cc", "license": "CC-BY", "rights_confirmed": True})}, headers=auth(c, "rights-source"))
    shot = analyzed["project"]["state"]["shot_ids"][0]
    attached = c.post(f"/api/studio/projects/{project['id']}/shots/{shot}", json={"expected_revision": 2, "source_id": source.json()["id"], "visual_mode": "source"}, headers=auth(c, "rights-attach"))
    assert attached.status_code == 200
    blockers = c.get(f"/api/studio/projects/{project['id']}/handoff").json()["blockers"]
    codes = {item["code"] for item in blockers}
    assert {"CC_BY_ATTRIBUTION_INCOMPLETE", "RIGHTS_NOT_READY"} <= codes


def test_default_factory_uses_canonical_store_for_media_composite(tmp_path):
    c = TestClient(create_media_app(tmp_path))
    token = c.get("/api/studio/session").json()["token"]
    project = c.post("/api/studio/projects", json={"name": "media", "profile": "newsroom"}, headers={"X-Studio-Token": token, "Idempotency-Key": "media-project"}).json()
    def image_bytes(color):
        output = io.BytesIO()
        Image.new("RGBA", (8, 8), color).save(output, format="PNG")
        return output.getvalue()
    def upload(key, role, color):
        response = c.post("/api/studio/sources", files={"file": (f"{role}.png", io.BytesIO(image_bytes(color)), "image/png")}, data={"metadata": json.dumps({"title": role, "license": "owned", "role": role, "rights_confirmed": True, "allow_transform": True})}, headers={"X-Studio-Token": token, "Idempotency-Key": key})
        assert response.status_code == 201
        return response.json()["id"]
    background = upload("media-background", "context", (30, 60, 90, 255))
    character = upload("media-character", "character", (220, 90, 60, 180))
    payload = {"expected_revision": 1, "background_source_id": background, "character_source_id": character, "x": 0, "y": 0, "scale": 1, "duration": 0.25}
    result = c.post(f"/api/studio/projects/{project['id']}/composite", json=payload, headers={"X-Studio-Token": token, "Idempotency-Key": "media-composite"})
    assert result.status_code == 200, result.text
    assert result.json()["production_eligible"] is False
    assert result.json()["project_revision"] == 2
    replay = c.post(f"/api/studio/projects/{project['id']}/composite", json=payload, headers={"X-Studio-Token": token, "Idempotency-Key": "media-composite"})
    assert replay.status_code == 200
    assert replay.json()["id"] == result.json()["id"]
    assert c.get(f"/api/studio/projects/{project['id']}/handoff").json()["media_artifacts"][0]["sha256"] == result.json()["sha256"]


def test_evidence_origin_is_explicit_and_unreviewed(tmp_path):
    c = client(tmp_path)
    project = c.post("/api/studio/projects", json={"name": "evidence", "profile": "newsroom"}, headers=auth(c, "evidence-project")).json()
    analyzed = c.post(f"/api/studio/projects/{project['id']}/analyze", json={"script": "증거 장면.", "expected_revision": 1}, headers=auth(c, "evidence-analyze")).json()
    source = c.post("/api/studio/sources", files={"file": ("evidence.png", io.BytesIO(b"\x89PNG\r\n\x1a\nevidence"), "image/png")}, data={"metadata": json.dumps({"title": "case", "creator": "operator", "source_url": "https://example.test/case", "license": "CC-BY", "license_url": "https://creativecommons.org/licenses/by/4.0/", "rights_evidence": "item page", "rights_confirmed": True, "role": "evidence", "context": "generic-context"})}, headers=auth(c, "evidence-source"))
    shot = analyzed["project"]["state"]["shot_ids"][0]
    assert c.post(f"/api/studio/projects/{project['id']}/shots/{shot}", json={"expected_revision": 2, "source_id": source.json()["id"], "visual_mode": "source"}, headers=auth(c, "evidence-attach")).status_code == 200
    packet = c.get(f"/api/studio/projects/{project['id']}/handoff").json()
    assert any(item["code"] == "EVIDENCE_ORIGIN_UNVERIFIED" for item in packet["blockers"])
    assert packet["sources"][0]["evidence_reviewed"] is False
    assert packet["sources"][0]["creator"] == "operator"
    assert packet["sources"][0]["allow_omni"] is False


def test_source_symlink_is_rejected_when_platform_allows_symlinks(tmp_path):
    c = client(tmp_path)
    source = c.post("/api/studio/sources", files={"file": ("safe.png", io.BytesIO(b"\x89PNG\r\n\x1a\nsafe"), "image/png")}, data={"metadata": json.dumps({"title": "safe", "license": "owned"})}, headers=auth(c, "symlink-source"))
    target = tmp_path / "sources" / source.json()["id"] / "original.png"
    outside = tmp_path / "outside.png"
    outside.write_bytes(b"\x89PNG\r\n\x1a\noutside")
    target.unlink()
    try:
        target.symlink_to(outside)
    except OSError:
        pytest.skip("symlink creation is unavailable on this Windows host")
    with pytest.raises(HTTPException) as error:
        c.app.state.store.resolve_source_path(source.json()["id"])
    assert error.value.detail["code"] == "SOURCE_SYMLINK"


def test_media_artifact_is_revision_bound_and_path_free(tmp_path):
    c = client(tmp_path)
    project = c.post("/api/studio/projects", json={"name": "artifact", "profile": "newsroom"}, headers=auth(c, "artifact-project")).json()
    result = record_media_artifact(c.app, project["id"], 1, {"id": "composite_12345678", "kind": "composite-preview", "sha256": "a" * 64, "byte_size": 10, "duration_seconds": 0.25, "source_ids": [], "production_eligible": False, "file_url": "/api/studio/projects/x/composites/y/file"})
    assert result["project"]["revision"] == 2
    packet = c.get(f"/api/studio/projects/{project['id']}/handoff").json()
    assert packet["media_artifacts"][0]["production_eligible"] is False
