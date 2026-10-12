"""Atomically upload a preview-only video release and separate review BGM.

Credentials are accepted only through environment variables. The script verifies
the pinned SSH host-key fingerprint before password authentication, uploads into
a temporary release directory, verifies every remote byte, and then atomically
updates ``/opt/youtube-videos/current-preview``.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import os
import posixpath
import socket
import uuid
from datetime import datetime, timezone
from pathlib import Path

import paramiko


RELEASE_ROOT = "/opt/youtube-videos/releases"
CURRENT_PREVIEW = "/opt/youtube-videos/current-preview"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def remote_sha256(sftp: paramiko.SFTPClient, path: str) -> str:
    digest = hashlib.sha256()
    with sftp.open(path, "rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def mkdir_exact(sftp: paramiko.SFTPClient, path: str, mode: int = 0o700) -> None:
    try:
        sftp.mkdir(path, mode=mode)
    except OSError as error:
        raise RuntimeError(f"Remote directory already exists or cannot be created: {path}") from error
    sftp.chmod(path, mode)


def remote_exists(sftp: paramiko.SFTPClient, path: str) -> bool:
    try:
        sftp.stat(path)
        return True
    except FileNotFoundError:
        return False


def remove_temp_tree(sftp: paramiko.SFTPClient, path: str) -> None:
    normalized = posixpath.normpath(path)
    if not normalized.startswith(f"{RELEASE_ROOT}/") or "/." not in normalized:
        raise RuntimeError(f"Refusing to clean unsafe temporary path: {path}")
    try:
        for entry in sftp.listdir_attr(normalized):
            child = posixpath.join(normalized, entry.filename)
            if entry.st_mode & 0o040000:
                remove_temp_tree(sftp, child)
            else:
                sftp.remove(child)
        sftp.rmdir(normalized)
    except FileNotFoundError:
        return


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--bgm", required=True, type=Path)
    parser.add_argument("--version-id", required=True)
    parser.add_argument("--project-id", default="jeju-school-intrusion")
    parser.add_argument("--release-date", default=datetime.now(timezone.utc).date().isoformat())
    parser.add_argument("--duration", required=True, type=float)
    parser.add_argument("--script-sha256", required=True)
    parser.add_argument("--video-sha256")
    parser.add_argument("--bgm-sha256")
    parser.add_argument("--host", default=os.environ.get("YOUTUBE_VPS_HOST", "13.140.176.125"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("YOUTUBE_VPS_PORT", "22")))
    parser.add_argument("--username", default=os.environ.get("YOUTUBE_VPS_USERNAME", "root"))
    parser.add_argument(
        "--host-key-sha256",
        default=os.environ.get(
            "YOUTUBE_VPS_HOST_KEY_SHA256",
            "SHA256:Tx97R3TB4Fh+vkL7K/+xOCijP5kVmqsWPx/2h1I3Iho",
        ),
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    password = os.environ.get("YOUTUBE_VPS_PASSWORD")
    if not password:
        raise RuntimeError("YOUTUBE_VPS_PASSWORD is required")
    if not args.video.is_file() or not args.bgm.is_file():
        raise FileNotFoundError("Video or BGM input is missing")
    if not args.version_id.replace("-", "").replace("_", "").isalnum():
        raise ValueError("version-id contains unsafe characters")
    if not args.project_id.replace("-", "").replace("_", "").isalnum():
        raise ValueError("project-id contains unsafe characters")
    if len(args.script_sha256) != 64:
        raise ValueError("script-sha256 must be a SHA-256 digest")

    video_hash = sha256_file(args.video)
    bgm_hash = sha256_file(args.bgm)
    if args.video_sha256 and args.video_sha256.lower() != video_hash:
        raise RuntimeError("Local video checksum does not match the expected digest")
    if args.bgm_sha256 and args.bgm_sha256.lower() != bgm_hash:
        raise RuntimeError("Local BGM checksum does not match the expected digest")

    release_dir = posixpath.normpath(
        posixpath.join(RELEASE_ROOT, args.release_date, args.project_id, args.version_id)
    )
    expected_prefix = f"{RELEASE_ROOT}/{args.release_date}/{args.project_id}/"
    if not release_dir.startswith(expected_prefix):
        raise RuntimeError("Resolved remote release escaped the allowed project directory")
    temp_dir = posixpath.join(
        posixpath.dirname(release_dir),
        f".{args.version_id}.tmp-{uuid.uuid4().hex}",
    )
    video_name = f"{args.project_id}-{args.version_id}.mp4"
    bgm_name = f"{args.project_id}-{args.version_id}-bgm-review.wav"

    manifest = {
        "versionId": args.version_id,
        "projectId": args.project_id,
        "releaseStatus": "preview",
        "publishable": False,
        "uploadBlocked": True,
        "videoContainsBgm": False,
        "bgmUsage": "separate-review-only",
        "durationSeconds": args.duration,
        "scriptSha256": args.script_sha256.lower(),
        "files": {
            "video": {
                "name": video_name,
                "sha256": video_hash,
                "bytes": args.video.stat().st_size,
            },
            "bgmReview": {
                "name": bgm_name,
                "sha256": bgm_hash,
                "bytes": args.bgm.stat().st_size,
            },
        },
        "uploadedAt": datetime.now(timezone.utc).isoformat(),
    }
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")

    sock = socket.create_connection((args.host, args.port), timeout=15)
    transport = paramiko.Transport(sock)
    sftp: paramiko.SFTPClient | None = None
    committed = False
    try:
        transport.start_client(timeout=15)
        server_key = transport.get_remote_server_key()
        observed = "SHA256:" + base64.b64encode(
            hashlib.sha256(server_key.asbytes()).digest()
        ).decode("ascii").rstrip("=")
        if observed != args.host_key_sha256:
            raise RuntimeError(f"VPS host-key mismatch: observed {observed}")
        transport.auth_password(args.username, password)
        if not transport.is_authenticated():
            raise RuntimeError("VPS password authentication failed")
        sftp = paramiko.SFTPClient.from_transport(transport)

        if remote_exists(sftp, release_dir):
            committed = True
            remote_video = posixpath.join(release_dir, video_name)
            remote_bgm = posixpath.join(release_dir, bgm_name)
            remote_manifest = posixpath.join(release_dir, "release.json")
            if remote_sha256(sftp, remote_video) != video_hash:
                raise RuntimeError("Existing release video checksum does not match this retry")
            if remote_sha256(sftp, remote_bgm) != bgm_hash:
                raise RuntimeError("Existing release BGM checksum does not match this retry")
            with sftp.open(remote_manifest, "r") as source:
                existing_manifest = json.loads(source.read().decode("utf-8"))
            if (
                existing_manifest.get("versionId") != args.version_id
                or existing_manifest.get("videoContainsBgm") is not False
                or existing_manifest.get("files", {}).get("video", {}).get("sha256") != video_hash
                or existing_manifest.get("files", {}).get("bgmReview", {}).get("sha256") != bgm_hash
            ):
                raise RuntimeError("Existing release manifest does not match this retry")
        else:
            parent_dir = posixpath.dirname(release_dir)
            stale_prefix = f".{args.version_id}.tmp-"
            for entry in sftp.listdir(parent_dir):
                if entry.startswith(stale_prefix):
                    remove_temp_tree(sftp, posixpath.join(parent_dir, entry))
            mkdir_exact(sftp, temp_dir)
            remote_video = posixpath.join(temp_dir, video_name)
            remote_bgm = posixpath.join(temp_dir, bgm_name)
            remote_manifest = posixpath.join(temp_dir, "release.json")
            sftp.put(str(args.video), remote_video, confirm=True)
            sftp.put(str(args.bgm), remote_bgm, confirm=True)
            sftp.putfo(io.BytesIO(manifest_bytes), remote_manifest, file_size=len(manifest_bytes), confirm=True)
            for remote_file in (remote_video, remote_bgm, remote_manifest):
                sftp.chmod(remote_file, 0o600)

            if remote_sha256(sftp, remote_video) != video_hash:
                raise RuntimeError("Remote video checksum mismatch")
            if remote_sha256(sftp, remote_bgm) != bgm_hash:
                raise RuntimeError("Remote BGM checksum mismatch")
            if remote_sha256(sftp, remote_manifest) != hashlib.sha256(manifest_bytes).hexdigest():
                raise RuntimeError("Remote release manifest checksum mismatch")

            sftp.rename(temp_dir, release_dir)
            committed = True
        preview_temp = f"{CURRENT_PREVIEW}.tmp-{uuid.uuid4().hex}"
        sftp.symlink(release_dir, preview_temp)
        try:
            sftp.posix_rename(preview_temp, CURRENT_PREVIEW)
        except OSError:
            channel = transport.open_session()
            quoted_temp = preview_temp.replace("'", "'\"'\"'")
            quoted_current = CURRENT_PREVIEW.replace("'", "'\"'\"'")
            channel.exec_command(f"mv -Tf '{quoted_temp}' '{quoted_current}'")
            exit_code = channel.recv_exit_status()
            channel.close()
            if exit_code != 0:
                raise RuntimeError("Could not atomically update current-preview")

        stat_video = sftp.stat(posixpath.join(release_dir, video_name))
        stat_bgm = sftp.stat(posixpath.join(release_dir, bgm_name))
        if stat_video.st_size != args.video.stat().st_size or stat_bgm.st_size != args.bgm.stat().st_size:
            raise RuntimeError("Remote file size verification failed")
        result = {
            "uploaded": True,
            "releaseDir": release_dir,
            "currentPreview": CURRENT_PREVIEW,
            "video": manifest["files"]["video"],
            "bgmReview": manifest["files"]["bgmReview"],
            "hostKeySha256": observed,
            "permissions": {"directory": "0700", "files": "0600"},
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
    finally:
        if sftp is not None and not committed:
            remove_temp_tree(sftp, temp_dir)
        if sftp is not None:
            sftp.close()
        transport.close()
        sock.close()


if __name__ == "__main__":
    main()
