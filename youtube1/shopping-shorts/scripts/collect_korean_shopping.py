"""Run the production stage-1 collector for Korean shopping Shorts queries."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import httpx


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_URL = "http://127.0.0.1:8765"
QUERIES = (
    "다이소 추천템 쇼츠",
    "쿠팡 추천템 쇼츠",
    "살림 꿀템 쇼츠",
)
TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED", "RETRYABLE_FAILURE", "WAITING_INPUT"}


def _headers(token: str) -> dict[str, str]:
    return {"X-Studio-Token": token, "Idempotency-Key": str(uuid.uuid4())}


def _spawn_server() -> None:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    subprocess.Popen(
        [sys.executable, "run.py"],
        cwd=ROOT,
        env=os.environ.copy(),
        creationflags=flags,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _client(base_url: str) -> httpx.Client:
    client = httpx.Client(base_url=base_url, timeout=60)
    try:
        client.get("/v1/session").raise_for_status()
        return client
    except (httpx.HTTPError, OSError):
        client.close()
    _spawn_server()
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        candidate = httpx.Client(base_url=base_url, timeout=60)
        try:
            candidate.get("/v1/session").raise_for_status()
            return candidate
        except (httpx.HTTPError, OSError):
            candidate.close()
            time.sleep(0.5)
    raise RuntimeError("Local shopping-shorts API did not start")


def _request(client: httpx.Client, method: str, path: str, **kwargs):
    response = client.request(method, path, **kwargs)
    if response.is_error:
        try:
            detail = response.json()
        except ValueError:
            detail = {"code": "HTTP_ERROR", "message": f"HTTP {response.status_code}"}
        raise RuntimeError(f"{detail.get('code', 'HTTP_ERROR')}: {detail.get('message', 'request failed')}")
    return response


def _wait(client: httpx.Client, job_id: str) -> dict:
    deadline = time.monotonic() + 120
    while time.monotonic() < deadline:
        job = _request(client, "GET", f"/v1/jobs/{job_id}").json()
        if job["state"] in TERMINAL:
            if job["state"] != "SUCCEEDED":
                error = job.get("error") or {}
                raise RuntimeError(f"{error.get('code', job['state'])}: {error.get('message', 'stage failed')}")
            return job
        time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for {job_id}")


def _project(client: httpx.Client, token: str, name: str) -> dict:
    projects = _request(client, "GET", "/v1/projects").json()
    existing = next((item for item in projects if item["name"] == name and item["state"]["mode"] == "production"), None)
    if existing:
        return existing
    return _request(
        client,
        "POST",
        "/v1/projects",
        headers=_headers(token),
        json={"name": name, "desired_seconds": 35, "mode": "production"},
    ).json()


def _collect_one(client: httpx.Client, token: str, query: str, age_hours: int) -> dict:
    name = f"한국 쇼핑쇼츠 자동수집 · {query}"
    project = _project(client, token, name)
    context = _request(client, "GET", f"/v1/projects/{project['id']}").json()
    revision = context["project"]["revision"]
    queued = _request(
        client,
        "POST",
        f"/v1/projects/{project['id']}/youtube-discovery",
        headers=_headers(token),
        json={
            "expected_revision": revision,
            "query": query,
            "candidate_id": None,
            "age_hours": age_hours,
            "region_code": "KR",
            "max_results": 50,
        },
    ).json()
    job = _wait(client, queued["job_id"])
    context = _request(client, "GET", f"/v1/projects/{project['id']}").json()
    receipt = next(
        item for item in context["records"]["receipts"]
        if f"query={query};" in item["data"].get("note", "")
    )
    evidence = _request(client, "GET", f"/v1/files/{receipt['data']['blob_id']}").json()
    candidate_id = evidence["normalized"][0]["video_id"]
    candidate = next(item for item in evidence["normalized"] if item["video_id"] == candidate_id)
    return {
        "query": query,
        "project_id": project["id"],
        "job_id": job["id"],
        "pipeline_status": job["output"].get("data", {}).get("result", {}).get("status"),
        "candidate": {
            "video_id": candidate["video_id"],
            "url": f"https://www.youtube.com/watch?v={candidate['video_id']}",
            "title": candidate["title"],
            "channel_id": candidate["channel_id"],
            "published_at": candidate["published_at"],
            "observed_at": candidate["observed_at"],
            "views": candidate["views"],
            "duration": candidate["duration"],
            "shorts_status": candidate["shorts_status"],
            "commerce_type": candidate["commerce_type"],
        },
        "cohort_count": max(0, len(evidence["normalized"]) - 1),
        "receipt_id": receipt["id"],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_URL)
    parser.add_argument("--age-hours", type=int, choices=(24, 72, 168), default=72)
    args = parser.parse_args()
    if not os.environ.get("YOUTUBE_API_KEY"):
        raise RuntimeError("YOUTUBE_API_KEY is not configured")
    client = _client(args.base_url)
    try:
        token = _request(client, "GET", "/v1/session").json()["token"]
        results = [_collect_one(client, token, query, args.age_hours) for query in QUERIES]
    finally:
        client.close()
    report = {
        "schema": "korean-shopping-youtube-report-v1",
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "region_code": "KR",
        "relevance_language": "ko",
        "age_hours": args.age_hours,
        "results": results,
    }
    reports = ROOT / "data" / "reports" / "korean-shopping"
    history = reports / "history"
    history.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    rendered = json.dumps(report, ensure_ascii=False, indent=2)
    (history / f"{stamp}.json").write_text(rendered, encoding="utf-8")
    (reports / "latest.json").write_text(rendered, encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
