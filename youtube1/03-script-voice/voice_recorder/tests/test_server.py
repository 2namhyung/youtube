import base64
import json
import sys
import tempfile
import threading
import unittest
from http.client import HTTPConnection
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


def wav_bytes():
    # Minimal valid PCM WAV header plus one sample.
    data = b"\x00\x00"
    out = bytearray(b"RIFF\x00\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80\xbb\x00\x00\x00w\x01\x00\x02\x00\x10\x00data\x02\x00\x00\x00")
    out[4:8] = (36 + len(data)).to_bytes(4, "little")
    return bytes(out) + data


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        server.RECORDINGS_ROOT = Path(cls.tmp.name) / "recordings"
        server.RECORDINGS_ROOT.mkdir()
        cls.httpd = server.ThreadingHTTPServer((server.HOST, 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.httpd.server_address[1]

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown(); cls.httpd.server_close(); cls.tmp.cleanup()

    def request(self, method, path, payload=None, headers=None):
        conn = HTTPConnection(server.HOST, self.port, timeout=3)
        body = None if payload is None else json.dumps(payload).encode()
        conn.request(method, path, body, headers or ({"Content-Type": "application/json"} if body else {}))
        response = conn.getresponse(); raw = response.read(); conn.close()
        return response.status, raw

    def test_health_and_static(self):
        status, raw = self.request("GET", "/api/health")
        self.assertEqual(status, 200); self.assertTrue(json.loads(raw)["ok"])
        status, raw = self.request("GET", "/")
        self.assertEqual(status, 200); self.assertIn(b"VOICE", raw)

    def test_save_and_list(self):
        payload = {"wav_base64": base64.b64encode(wav_bytes()).decode(), "transcript": "테스트 문장", "metadata": {"sample_rate": 48000}}
        status, raw = self.request("POST", "/api/save", payload)
        self.assertEqual(status, 201); result = json.loads(raw); self.assertTrue(result["ok"])
        folder = server.RECORDINGS_ROOT / result["id"]
        self.assertTrue((folder / "reference.wav").is_file()); self.assertEqual((folder / "reference.txt").read_text(encoding="utf-8"), "테스트 문장")
        status, raw = self.request("GET", "/api/recordings")
        self.assertEqual(status, 200); self.assertEqual(len(json.loads(raw)["recordings"]), 1)

    def test_validation(self):
        status, _ = self.request("POST", "/api/save", {"wav_base64": "bad", "transcript": "x"})
        self.assertEqual(status, 400)
        status, _ = self.request("POST", "/api/save", {"wav_base64": base64.b64encode(wav_bytes()).decode(), "transcript": ""})
        self.assertEqual(status, 400)
        status, _ = self.request("GET", "/../server.py")
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
