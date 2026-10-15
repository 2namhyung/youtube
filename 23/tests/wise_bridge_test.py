"""Offline checks for the canonical Production Studio WISE bridge."""

import base64
import contextlib
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "visualmaker" / "scripts" / "wise_bridge.py"
spec = importlib.util.spec_from_file_location("vm_wise_bridge", SCRIPT)
bridge = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bridge)
SIBLING = Path(__file__).resolve().parents[2] / "youtube1" / "production-studio"


class FakeWise:
    configured = True
    def search(self, query, top_k, source_index, search_in):
        assert query == "courthouse exterior" and top_k == 5 and search_in == "image"
        source = source_index["src-1"]
        return {"results": [{"source_id": "src-1", "sha256": source["sha256"],
                              "raw_start": 0, "raw_end": 0, "start": 0, "end": 0}], "unresolved": []}


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="vm-wise-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.sources = self.root / "sources" / "src-1"
        self.sources.mkdir(parents=True)
        self.media = self.sources / "original.png"
        self.media.write_bytes(b"synthetic-source-bytes")
        self.digest = hashlib.sha256(self.media.read_bytes()).hexdigest()
        self.db = self.root / "studio.sqlite3"
        db = sqlite3.connect(self.db)
        try:
            db.execute("""CREATE TABLE sources(id TEXT PRIMARY KEY,title TEXT,source_url TEXT,creator TEXT,
                license TEXT,license_url TEXT,rights_evidence TEXT,rights_confirmed INTEGER,role TEXT,
                allow_transform INTEGER,allow_imagegen INTEGER,allow_omni INTEGER,relative_path TEXT,
                original_sha256 TEXT,byte_size INTEGER,media_type TEXT,duration_seconds REAL,created_at TEXT,
                metadata_json TEXT)""")
            db.execute("INSERT INTO sources VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                       ("src-1", "Courthouse exterior", "https://example.test/source", "Fixture creator",
                        "CC BY 4.0", "https://creativecommons.org/licenses/by/4.0/", "fixture evidence", 1,
                        "background", 0, 0, 0, "src-1/original.png", self.digest, self.media.stat().st_size,
                        "image", None, "2026-01-01", "{}"))
            db.commit()
        finally:
            db.close()
        self.env = patch.dict(os.environ, {"STUDIO_DATA_DIR": str(self.root), "STUDIO_DB_PATH": str(self.db),
                                          "WISE_STUDIO_ROOT": str(SIBLING)})
        self.env.start()
        self.addCleanup(self.env.stop)
        _, self.base, _, _, _ = bridge.setup()

    def run_bridge(self, action, request):
        args = [str(SCRIPT), action, base64.b64encode(json.dumps(request).encode()).decode()]
        output = io.StringIO()
        with patch.object(sys, "argv", args), patch.object(bridge, "setup", return_value=(SIBLING, self.base, FakeWise, Exception, Exception)), contextlib.redirect_stdout(output):
            try:
                bridge.main()
            except SystemExit as exc:
                self.assertEqual(exc.code, 0)
        return json.loads(output.getvalue())

    def test_search_maps_existing_canonical_source_without_writes(self):
        before = sorted(str(p.relative_to(self.root)) for p in self.root.rglob("*"))
        result = self.run_bridge("search", {"kind": "image", "query": "courthouse exterior"})
        self.assertEqual(result["status"], "available")
        self.assertEqual(len(result["candidates"]), 1)
        card = result["candidates"][0]
        self.assertEqual(card["sourceId"], "src-1")
        self.assertEqual(card["wiseMediaId"], "src-1.png")
        self.assertEqual(card["sha256"], self.digest)
        self.assertEqual(before, sorted(str(p.relative_to(self.root)) for p in self.root.rglob("*")))
        self.assertEqual(self.media.read_bytes(), b"synthetic-source-bytes")

    def test_import_rechecks_hash_metadata_and_returns_exact_bytes(self):
        card = self.run_bridge("search", {"kind": "image", "query": "courthouse exterior"})["candidates"][0]
        request = {"kind": "image", "sourceId": card["sourceId"], "wiseMediaId": card["wiseMediaId"],
                   "sha256": card["sha256"], "metadataSha256": card["metadataSha256"],
                   "selectedSpan": card["selectedSpan"]}
        result = self.run_bridge("import", request)
        self.assertEqual(base64.b64decode(result["bytesBase64"]), self.media.read_bytes())
        request["metadataSha256"] = "0" * 64
        self.assertEqual(self.run_bridge("import", request)["reason"], "source-changed")
        self.media.write_bytes(b"changed")
        self.assertEqual(self.run_bridge("import", {**request, "metadataSha256": card["metadataSha256"]})["status"], "unavailable")

    def test_missing_db_and_invalid_span_fail_closed(self):
        card = self.run_bridge("search", {"kind": "image", "query": "courthouse exterior"})["candidates"][0]
        bad = {"kind": "image", "sourceId": card["sourceId"], "wiseMediaId": card["wiseMediaId"],
               "sha256": card["sha256"], "metadataSha256": card["metadataSha256"],
               "selectedSpan": {"startSeconds": 1, "endSeconds": 2}}
        self.assertEqual(self.run_bridge("import", bad)["reason"], "invalid-or-unavailable-source")
        self.db.unlink()
        self.assertEqual(self.run_bridge("search", {"kind": "image", "query": "courthouse exterior"})["reason"], "missing-database")

    def test_isolated_real_cli_import_and_offline_search(self):
        card = self.run_bridge("search", {"kind": "image", "query": "courthouse exterior"})["candidates"][0]
        def actual(action, payload):
            encoded = base64.b64encode(json.dumps(payload).encode()).decode()
            env = {**os.environ, "STUDIO_DATA_DIR": str(self.root), "STUDIO_DB_PATH": str(self.db),
                   "WISE_STUDIO_ROOT": str(SIBLING)}
            env.pop("WISE_URL", None)
            result = subprocess.run([sys.executable, "-I", "-B", str(SCRIPT), action, encoded],
                                    env=env, capture_output=True, timeout=10, check=True)
            return json.loads(result.stdout)
        imported = actual("import", {"kind": "image", "sourceId": card["sourceId"],
                                     "wiseMediaId": card["wiseMediaId"], "sha256": card["sha256"],
                                     "metadataSha256": card["metadataSha256"], "selectedSpan": card["selectedSpan"]})
        self.assertEqual(base64.b64decode(imported["bytesBase64"]), self.media.read_bytes())
        self.assertEqual(actual("search", {"kind": "image", "query": "courthouse exterior"})["reason"], "wise-not-configured")

    def test_unsafe_canonical_license_url_and_module_path_are_rejected(self):
        db = sqlite3.connect(self.db)
        try:
            db.execute("UPDATE sources SET license_url='file:///C:/private' WHERE id='src-1'")
            db.commit()
        finally:
            db.close()
        result = self.run_bridge("search", {"kind": "image", "query": "courthouse exterior"})
        self.assertEqual(result["candidates"], [])
        outsider = self.root / "outside.py"
        outsider.write_text("x=1", encoding="utf-8")
        with contextlib.redirect_stdout(io.StringIO()), self.assertRaises(SystemExit):
            bridge.contained_file(outsider, SIBLING / "backend")


if __name__ == "__main__":
    unittest.main()
