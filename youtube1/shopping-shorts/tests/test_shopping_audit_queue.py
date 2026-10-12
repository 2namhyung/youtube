import json

from fastapi.testclient import TestClient

from apps.api import main


def test_shopping_channel_audit_queue_exposes_generated_local_queue(tmp_path, monkeypatch):
    report_dir = tmp_path / "data" / "reports" / "shopping-channel-classification"
    report_dir.mkdir(parents=True)
    (report_dir / "browser-queue.json").write_text(
        json.dumps({"channels": [{"channel_id": "channel", "candidates": []}]}),
        encoding="utf-8",
    )
    monkeypatch.setattr(main, "ROOT", tmp_path)
    app = main.create_app(tmp_path / "store", start_worker=False)

    with TestClient(app) as client:
        response = client.get("/v1/shopping-channel-audit-queue")

    assert response.status_code == 200
    assert response.json()["count"] == 1
