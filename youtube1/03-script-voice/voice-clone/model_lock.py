from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
LOCK_PATH = ROOT / "model-lock.json"


def load_model_lock() -> dict:
    return json.loads(LOCK_PATH.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model(model_dir: Path) -> dict:
    lock = load_model_lock()
    failures = []
    for relative, expected in lock["files"].items():
        target = model_dir / relative
        if not target.is_file():
            failures.append(f"{relative}: missing")
            continue
        actual = sha256_file(target)
        if actual.lower() != expected.lower():
            failures.append(f"{relative}: sha256 mismatch")
    if failures:
        raise RuntimeError(
            "CosyVoice model integrity verification failed: " + "; ".join(failures)
        )
    return lock
