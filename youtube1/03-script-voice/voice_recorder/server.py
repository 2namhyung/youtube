"""Local-only reference voice recorder server (Python standard library)."""
from __future__ import annotations

import base64
import binascii
import json
import mimetypes
import os
import re
import threading
import webbrowser
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

HOST = "127.0.0.1"
PORT = int(os.environ.get("VOICE_RECORDER_PORT", "8765"))
ROOT = Path(__file__).resolve().parent
WEB_ROOT = ROOT / "web"
RECORDINGS_ROOT = ROOT / "recordings"
MAX_BODY = 16 * 1024 * 1024
MAX_TRANSCRIPT = 20_000
SAFE_NAME = re.compile(r"^\d{8}_\d{6}(?:_\d{2})?$")


def json_bytes(value: object, status: int = 200) -> tuple[bytes, int]:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), status


class Handler(BaseHTTPRequestHandler):
    server_version = "VoiceRecorder/1.0"

    def log_message(self, fmt: str, *args: object) -> None:
        # Keep local console useful without leaking transcript/audio data.
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")

    def _send(self, body: bytes, status: int = 200, content_type: str = "application/json; charset=utf-8") -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; connect-src 'self'; media-src 'self' blob:; style-src 'self'; script-src 'self'; img-src 'self' data:")
        self.end_headers()
        self.wfile.write(body)

    def _error(self, message: str, status: int = 400) -> None:
        body, _ = json_bytes({"ok": False, "error": message}, status)
        self._send(body, status)

    def do_GET(self) -> None:
        path = unquote(urlparse(self.path).path)
        if path == "/api/recordings":
            self._list_recordings()
            return
        if path == "/api/health":
            body, _ = json_bytes({"ok": True, "service": "voice_recorder"})
            self._send(body)
            return
        self._serve_static(path)

    def _serve_static(self, path: str) -> None:
        rel = "index.html" if path in ("", "/") else path.lstrip("/")
        candidate = (WEB_ROOT / rel).resolve()
        try:
            candidate.relative_to(WEB_ROOT.resolve())
        except ValueError:
            self._error("잘못된 경로입니다.", 404)
            return
        if not candidate.is_file():
            self._error("파일을 찾을 수 없습니다.", 404)
            return
        data = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        if content_type.startswith("text/") or content_type in ("application/javascript", "application/json"):
            content_type += "; charset=utf-8"
        self._send(data, 200, content_type)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/save":
            self._error("지원하지 않는 요청입니다.", 404)
            return
        length_header = self.headers.get("Content-Length")
        try:
            length = int(length_header or "-1")
        except ValueError:
            length = -1
        if length < 0 or length > MAX_BODY:
            self._error("요청 본문이 너무 크거나 올바르지 않습니다.", 413)
            return
        raw = self.rfile.read(length)
        if len(raw) != length:
            self._error("요청 본문을 끝까지 읽지 못했습니다.", 400)
            return
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error("JSON 형식이 아닙니다.", 400)
            return
        if not isinstance(payload, dict):
            self._error("JSON 객체가 필요합니다.", 400)
            return
        transcript = payload.get("transcript")
        encoded = payload.get("wav_base64")
        if not isinstance(transcript, str) or not transcript.strip():
            self._error("transcript가 비어 있습니다.", 400)
            return
        if len(transcript) > MAX_TRANSCRIPT:
            self._error("transcript가 너무 깁니다.", 413)
            return
        if not isinstance(encoded, str) or len(encoded) > MAX_BODY:
            self._error("WAV 데이터가 없거나 너무 큽니다.", 413)
            return
        try:
            wav = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError):
            self._error("WAV base64가 올바르지 않습니다.", 400)
            return
        if len(wav) < 44 or wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
            self._error("유효한 WAV 파일이 아닙니다.", 400)
            return
        metadata = payload.get("metadata", {})
        if not isinstance(metadata, dict):
            self._error("metadata는 객체여야 합니다.", 400)
            return
        # Avoid writing arbitrarily deep/large values supplied by a client.
        try:
            metadata_json = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
        except (TypeError, ValueError):
            self._error("metadata를 JSON으로 저장할 수 없습니다.", 400)
            return
        if len(metadata_json.encode("utf-8")) > 64_000:
            self._error("metadata가 너무 큽니다.", 413)
            return
        folder = datetime.now().strftime("%Y%m%d_%H%M%S")
        target = RECORDINGS_ROOT / folder
        suffix = 1
        while target.exists():
            target = RECORDINGS_ROOT / f"{folder}_{suffix:02d}"
            suffix += 1
        target.mkdir(parents=True, exist_ok=False)
        metadata_out = {
            **metadata,
            "transcript_chars": len(transcript),
            "saved_at": datetime.now(timezone.utc).isoformat(),
            "wav_bytes": len(wav),
        }
        try:
            (target / "reference.wav").write_bytes(wav)
            (target / "reference.txt").write_text(transcript, encoding="utf-8")
            (target / "metadata.json").write_text(json.dumps(metadata_out, ensure_ascii=False, indent=2), encoding="utf-8")
        except OSError:
            self._error("파일 저장에 실패했습니다.", 500)
            return
        body, _ = json_bytes({"ok": True, "id": target.name, "path": f"recordings/{target.name}"})
        self._send(body, 201)

    def _list_recordings(self) -> None:
        items = []
        if RECORDINGS_ROOT.exists():
            for folder in sorted(RECORDINGS_ROOT.iterdir(), reverse=True):
                if not folder.is_dir() or not SAFE_NAME.match(folder.name):
                    continue
                wav = folder / "reference.wav"
                txt = folder / "reference.txt"
                meta = folder / "metadata.json"
                if wav.is_file() and txt.is_file() and meta.is_file():
                    items.append({"id": folder.name, "wav_bytes": wav.stat().st_size, "transcript_chars": len(txt.read_text(encoding="utf-8"))})
        body, _ = json_bytes({"ok": True, "recordings": items})
        self._send(body)


def main() -> None:
    RECORDINGS_ROOT.mkdir(exist_ok=True)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}/"
    print(f"Voice Recorder running at {url} (Ctrl+C to stop)")
    if os.environ.get("VOICE_RECORDER_NO_BROWSER") != "1":
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping voice recorder.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
