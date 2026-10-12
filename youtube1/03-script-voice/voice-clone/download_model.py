from __future__ import annotations

import os
from pathlib import Path


ROOT = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(ROOT / "cache" / "huggingface"))

from huggingface_hub import snapshot_download
from model_lock import load_model_lock, verify_model


destination = ROOT / "models" / "Fun-CosyVoice3-0.5B"
lock = load_model_lock()
snapshot_download(
    repo_id=lock["repository"],
    revision=lock["revision"],
    local_dir=destination,
)
verify_model(destination)
print(destination.resolve())
