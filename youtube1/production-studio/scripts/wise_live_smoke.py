"""Fixture-only live WISE integration check for the local adapter.

This script uses an isolated temporary store and never imports production source
records. It starts WISE on its own loopback port, exercises both modalities,
checks the timestamp clamp and persists a compact verification record.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path
import sys
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from PIL import Image

from backend.wise import WiseClient
from scripts.wise_index import read_job, run_index, write_job


@dataclass
class FixtureStore:
    root: Path
    media_root: Path
    records: dict[str, dict]

    def recheck_source(self, source_id: str) -> dict:
        return self.records[source_id]

    def resolve_source_path(self, source_id: str) -> Path:
        return self.media_root / self.records[source_id]["relative_path"]


def _make_store(root: Path) -> tuple[FixtureStore, list[str]]:
    media_root = root / "sources"
    media_root.mkdir(parents=True)
    image = media_root / "img-original.png"
    Image.new("RGB", (96, 64), (220, 40, 30)).save(image, format="PNG")
    video = media_root / "video-original.mp4"
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=96x64:rate=12:duration=2", "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)], check=True)
    import hashlib

    def record(source_id: str, path: Path, duration: float | None) -> dict:
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        return {"id": source_id, "relative_path": path.name, "original_sha256": digest,
                "byte_size": path.stat().st_size, "rights_confirmed": True, "allow_transform": True,
                "license": "owned", "creator": "fixture", "source_url": "fixture://source",
                "license_url": "fixture://license", "rights_evidence": "fixture-rights", "duration_seconds": duration}

    records = {"fixture_image": record("fixture_image", image, None), "fixture_video": record("fixture_video", video, 2.0)}
    return FixtureStore(root, media_root, records), list(records)


def main() -> int:
    os.environ["WISE_WSL_DISTRO"] = os.environ.get("WISE_WSL_DISTRO", "Ubuntu")
    os.environ["WISE_PORT"] = "9672"
    with tempfile.TemporaryDirectory(prefix="studio-wise-live-") as raw:
        store, source_ids = _make_store(Path(raw))
        result = run_index(store, source_ids, start_server=True)
        client = WiseClient(result["wise_url"])
        status = client.status()
        source_index = {item["source_id"]: {**item, "duration": store.records[item["source_id"]]["duration_seconds"]} for item in result["manifest"]}
        video = client.search("red moving scene", 10, source_index, "video")
        image = client.search("red image", 10, source_index, "image")
        # Use another owned loopback port for the re-index check so the first
        # server remains a valid, independently addressable run.
        os.environ["WISE_PORT"] = "9673"
        second = run_index(store, ["fixture_video"], run_id="wise-second-fixture", start_server=True)
        second_client = WiseClient(second["wise_url"])
        second_index = {item["source_id"]: {**item, "duration": store.records[item["source_id"]]["duration_seconds"]} for item in second["manifest"]}
        second_search = second_client.search("red moving scene", 10, second_index, "video")
        with urlopen(result["wise_url"] + "info", timeout=3) as response:
            old_server_status = response.status
        job_id = "wise-job-fixture-live"
        write_job(store, job_id, {"id": job_id, "status": "running", "source_ids": source_ids})
        recovered = read_job(store, job_id)
        process_pid = result.get("server_pid")
        if process_pid:
            # The process is owned by this check; the production server is on another port.
            subprocess.run(["taskkill", "/PID", str(process_pid), "/T", "/F"], capture_output=True, check=False)
        second_process_pid = second.get("server_pid")
        if second_process_pid:
            subprocess.run(["taskkill", "/PID", str(second_process_pid), "/T", "/F"], capture_output=True, check=False)
        payload = {
            "fixture_only": True, "port": 9672, "status": status.get("status"),
            "source_ids": source_ids, "manifest": [{"source_id": x["source_id"], "sha256": x["sha256"], "wise_media_id": x["wise_media_id"]} for x in result["manifest"]],
            "video": {"status": video.get("status"), "count": len(video.get("results", [])), "unresolved": len(video.get("unresolved", [])), "results": [{k: item.get(k) for k in ("source_id", "sha256", "start", "end", "raw_start", "raw_end", "timestamp_clamped")} for item in video.get("results", [])]},
            "image": {"status": image.get("status"), "count": len(image.get("results", [])), "unresolved": len(image.get("unresolved", []))},
            "second_index": {"status": second.get("status"), "source_count": second.get("source_count"), "wise_url": second.get("wise_url"), "search_count": len(second_search.get("results", [])), "search_source_ids": [item.get("source_id") for item in second_search.get("results", [])]},
            "old_server_status_while_second_index": old_server_status,
            "recovered_job_status": recovered.get("status") if recovered else None,
        }
        output = Path(__file__).resolve().parents[1] / "verification" / "wise-library-integration.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
