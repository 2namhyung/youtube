"""Build an isolated WISE project from canonical, rights-checked sources.

This launcher never downloads media and never executes a user supplied command.
It stages exact source bytes under source ids so WISE's media ids can be mapped
back to the StudioStore hash manifest after search.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import mimetypes
import os
import re
import shutil
import signal
import subprocess
import time
from urllib.parse import urlparse
from urllib.request import urlopen
import uuid
from pathlib import Path
from typing import Any


SOURCE_ID = re.compile(r"^[A-Za-z0-9_-]{1,120}$")


class WiseIndexError(RuntimeError):
    pass


def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    temporary.replace(path)


def job_file(store: Any, job_id: str) -> Path:
    if not SOURCE_ID.fullmatch(job_id):
        raise WiseIndexError("invalid WISE job id")
    return (Path(store.root) / "wise" / "jobs" / f"{job_id}.json").resolve()


def write_job(store: Any, job_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    safe = {key: value for key, value in payload.items() if key not in {"stderr", "stdout", "project_dir", "staging_dir"}}
    safe["id"] = job_id
    _atomic_json(job_file(store, job_id), safe)
    return safe


def read_job(store: Any, job_id: str) -> dict[str, Any] | None:
    path = job_file(store, job_id)
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(value, dict):
        return None
    if value.get("status") == "running":
        value = {**value, "status": "interrupted", "reason": "The local worker was restarted before completion"}
        _atomic_json(path, value)
    return value


def active_file(store: Any) -> Path:
    return (Path(store.root) / "wise" / "active.json").resolve()


def read_active(store: Any) -> dict[str, Any] | None:
    try:
        value = json.loads(active_file(store).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return value if isinstance(value, dict) else None


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_staging(store: Any, source_ids: list[str], *, run_id: str | None = None) -> tuple[Path, Path, list[dict[str, Any]]]:
    if not source_ids or len(source_ids) > 500:
        raise WiseIndexError("one to 500 source ids are required")
    run = run_id or ("wise-" + uuid.uuid4().hex)
    if not SOURCE_ID.fullmatch(run):
        raise WiseIndexError("invalid WISE run id")
    run_root = (Path(store.root) / "wise" / "runs" / run).resolve()
    staging = run_root / "media"
    # WISE serves the project basename in its URL. Keep it unique per run so
    # an old server cannot accidentally answer requests for a re-index.
    project = run_root / f"project-{run}"
    staging.mkdir(parents=True, exist_ok=False)
    manifest: list[dict[str, Any]] = []
    try:
        for source_id in source_ids:
            if not SOURCE_ID.fullmatch(source_id):
                raise WiseIndexError("invalid source id")
            source = store.recheck_source(source_id)
            if not source.get("rights_confirmed"):
                raise WiseIndexError(f"source {source_id} has no confirmed rights")
            source_path = store.resolve_source_path(source_id)
            if source_path is None or source_path.is_symlink() or not source_path.is_file():
                raise WiseIndexError(f"source {source_id} bytes are unavailable")
            media_type = str(source.get("media_type", "")).lower().split(";", 1)[0].strip()
            guessed_type = mimetypes.guess_type(source_path.name)[0] or ""
            effective_type = media_type or guessed_type
            if effective_type.startswith("audio/"):
                raise WiseIndexError(f"source {source_id} is audio-only and cannot be indexed")
            if not (effective_type.startswith("image/") or effective_type.startswith("video/")):
                raise WiseIndexError(f"source {source_id} must be an image or video for WISE indexing")
            expected = str(source.get("original_sha256", "")).lower()
            before = _sha256(source_path)
            if expected and before != expected:
                raise WiseIndexError(f"source {source_id} changed during WISE admission")
            suffix = source_path.suffix.lower() if re.fullmatch(r"\.[A-Za-z0-9]{1,12}", source_path.suffix) else ".bin"
            target = staging / f"{source_id}{suffix}"
            with source_path.open("rb") as src, target.open("xb") as dst:
                shutil.copyfileobj(src, dst, length=1024 * 1024)
            after = _sha256(target)
            if after != before:
                raise WiseIndexError(f"source {source_id} failed byte verification")
            manifest.append({"source_id": source_id, "wise_media_id": target.name,
                             "path": target.name, "sha256": after, "bytes": target.stat().st_size})
        manifest_path = run_root / "source-manifest.json"
        manifest_path.write_text(json.dumps({"schema": "wise-source-manifest-v1", "run_id": run, "items": manifest}, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        shutil.rmtree(run_root, ignore_errors=True)
        raise
    return staging, project, manifest


def _wsl_path(path: Path, distro: str) -> str:
    resolved = str(path.resolve()).replace("\\", "/")
    match = re.fullmatch(r"([A-Za-z]):/(.+)", resolved)
    if not match:
        raise WiseIndexError("only Windows drive paths can be mounted into WSL")
    return f"/mnt/{match.group(1).lower()}/{match.group(2)}"


def _wsl_command(wsl: str, distro: str, python_bin: str, args: list[str], *, port: int | None = None) -> list[str]:
    runtime_bin = str(Path(python_bin).parent)
    env_path = f"{runtime_bin}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
    variables = [f"PATH={env_path}", "TORCH_COMPILE_DISABLE=1", "OMP_NUM_THREADS=4"]
    if port is not None:
        variables.extend(["LISTEN_ADDRESS=127.0.0.1", f"PORT={port}"])
    return [wsl, "--distribution", distro, "--", "/usr/bin/env", *variables, python_bin, "-m", "wise", *args]


def _discover_python(wsl: str, distro: str) -> str:
    configured = os.environ.get("WISE_WSL_PYTHON", "").strip()
    if configured:
        if not re.fullmatch(r"/[A-Za-z0-9_./-]+", configured):
            raise WiseIndexError("invalid WISE_WSL_PYTHON")
        return configured
    result = subprocess.run(
        [wsl, "--distribution", distro, "--", "sh", "-lc", "printf '%s/.local/share/production-studio/wise-env/bin/python' \"$HOME\""],
        capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=15, check=False, shell=False,
    )
    candidate = result.stdout.strip()
    if result.returncode == 0 and re.fullmatch(r"/[A-Za-z0-9_./-]+", candidate):
        return candidate
    return "python"


def _wait_for_server(url: str, process: subprocess.Popen[Any], timeout: float = 45.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise WiseIndexError("WISE server stopped during startup")
        try:
            with urlopen(url + "info", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.5)
    raise WiseIndexError("WISE server did not become ready")


def _stop_owned_server(store: Any, port: int, run_id: str) -> None:
    """Stop only the previously persisted WISE process on this owned port."""
    active = read_active(store) or {}
    if active.get("run_id") == run_id:
        return
    old_url = str(active.get("wise_url", ""))
    try:
        old_port = int(urlparse(old_url).port or 0)
        pid = int(active.get("server_pid") or 0)
    except (TypeError, ValueError):
        return
    if old_port != port or pid <= 0:
        return
    project_dir = Path(str(active.get("project_dir", ""))).resolve()
    runs_root = (Path(store.root) / "wise" / "runs").resolve()
    try:
        project_dir.relative_to(runs_root)
    except ValueError:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, check=False, shell=False)
    else:
        try:
            os.kill(pid, signal.SIGTERM)
        except (OSError, ProcessLookupError):
            pass
    time.sleep(0.5)


def run_index(store: Any, source_ids: list[str], *, run_id: str | None = None,
              start_server: bool = True) -> dict[str, Any]:
    staging, project, manifest = prepare_staging(store, source_ids, run_id=run_id)
    distro = os.environ.get("WISE_WSL_DISTRO", "Ubuntu").strip()
    if not SOURCE_ID.fullmatch(distro.replace(".", "_")):
        raise WiseIndexError("invalid WSL distribution name")
    wsl = shutil.which("wsl.exe") or shutil.which("wsl")
    if not wsl:
        raise WiseIndexError("WSL is unavailable")
    staging_linux, project_linux = _wsl_path(staging, distro), _wsl_path(project, distro)
    python_bin = _discover_python(wsl, distro)
    python_args = _wsl_command(wsl, distro, python_bin, [
        "extract-features", staging_linux, "--project-dir", project_linux,
        "--image-feature-id", "mlfoundations/open_clip/ViT-B-16-SigLIP2-512/webli",
        "--video-feature-id", "mlfoundations/open_clip/ViT-B-16-SigLIP2-512/webli",
        "--num-workers", "0", "--thumbnails",
    ])
    result = subprocess.run(python_args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60 * 60 * 8, check=False, shell=False)
    if result.returncode != 0:
        raise WiseIndexError("WISE feature extraction failed")
    result = subprocess.run(_wsl_command(wsl, distro, python_bin, ["create-index", "--project-dir", project_linux, "--overwrite"]), capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=60 * 60 * 2, check=False, shell=False)
    if result.returncode != 0:
        raise WiseIndexError("WISE index creation failed")
    url = ""
    process_pid = None
    if start_server:
        port = int(os.environ.get("WISE_PORT", "9670"))
        if not 1024 <= port <= 65535:
            raise WiseIndexError("WISE_PORT must be between 1024 and 65535")
        theme = Path(__file__).resolve().parents[1] / "web" / "dist"
        if not theme.is_dir() or not (theme / "index.html").is_file():
            raise WiseIndexError("WISE theme assets are missing")
        _stop_owned_server(store, port, project.name)
        theme_linux = _wsl_path(theme, distro)
        command = _wsl_command(wsl, distro, python_bin, ["serve", "--project-dir", project_linux, "--theme-asset-dir", theme_linux], port=port)
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False, creationflags=getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0))
        url = f"http://127.0.0.1:{port}/{project.name}/"
        try:
            _wait_for_server(url, process)
        except Exception:
            if process.poll() is None:
                process.terminate()
            raise
        process_pid = process.pid
    result = {"status": "ready", "run_id": project.name, "source_count": len(manifest), "manifest": manifest,
              "wise_url": url, "server_pid": process_pid,
              "project_dir": str(project), "manifest_path": str(project.parent / "source-manifest.json")}
    if start_server:
        _atomic_json(active_file(store), {key: value for key, value in result.items() if key not in {"manifest"}})
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Build a WISE index from StudioStore source ids")
    parser.add_argument("source_ids", nargs="+", help="canonical source ids")
    parser.add_argument("--run-id", default=None)
    args = parser.parse_args()
    raise SystemExit("Use the Production Studio API/store adapter to run WISE indexing; this CLI does not read a database directly.")


if __name__ == "__main__":
    main()
