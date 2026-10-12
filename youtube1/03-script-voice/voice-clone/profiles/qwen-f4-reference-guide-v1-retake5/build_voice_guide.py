from __future__ import annotations

import hashlib
import json
import os
import random
import subprocess
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
PROFILE = Path(__file__).resolve().parent
COSYVOICE_ROOT = ROOT / "legacy-root-copy" / "vendor-root" / "CosyVoice"
MATCHA_ROOT = COSYVOICE_ROOT / "third_party" / "Matcha-TTS"
MODEL_DIR = ROOT / "models" / "Fun-CosyVoice3-0.5B"
SOURCE = PROFILE / "provenance" / "reference-carrier.wav"
TARGET = ROOT.parent / "runs" / "owner-voice-refresh-20260807" / "owner-timbre-reference-v1-retake5.wav"
RAW = PROFILE / "provenance" / "reference-guide-raw.wav"
FINAL = PROFILE / "prompt-bank" / "assets" / "reference-guide.wav"
SEED = 20260807


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    import torch
    import torchaudio

    sys.path.insert(0, str(COSYVOICE_ROOT))
    sys.path.insert(0, str(MATCHA_ROOT))
    from cosyvoice.cli.cosyvoice import AutoModel

    if not torch.cuda.is_available():
        raise RuntimeError("CosyVoice guide conversion requires CUDA")
    for required in (MODEL_DIR, SOURCE, TARGET):
        if not required.exists():
            raise FileNotFoundError(required)

    RAW.parent.mkdir(parents=True, exist_ok=True)
    FINAL.parent.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)

    model = AutoModel(model_dir=str(MODEL_DIR), load_trt=False, load_vllm=False, fp16=True)
    chunks = [
        item["tts_speech"].detach().cpu()
        for item in model.inference_vc(str(SOURCE), str(TARGET), stream=False, speed=1.0)
    ]
    if not chunks:
        raise RuntimeError("CosyVoice returned no converted guide audio")
    speech = torch.cat(chunks, dim=1)
    torchaudio.save(str(RAW), speech, model.sample_rate)

    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(RAW),
        "-af", "loudnorm=I=-22.9:TP=-2:LRA=7,apad,atrim=end=10.760",
        "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(FINAL),
    ], check=True)
    report = {
        "schemaVersion": 1,
        "engine": "FunAudioLLM/Fun-CosyVoice3-0.5B-2512 inference_vc",
        "revision": "29e01c4e8d000f4bcd70751be16fa94bf3d85a18",
        "seed": SEED,
        "sourceCarrier": {"path": str(SOURCE.relative_to(ROOT.parents[1])).replace("\\", "/"), "sha256": sha256(SOURCE)},
        "targetOwnerReference": {"path": str(TARGET.relative_to(ROOT.parents[1])).replace("\\", "/"), "sha256": sha256(TARGET)},
        "rawGuide": {"path": str(RAW.relative_to(ROOT.parents[1])).replace("\\", "/"), "sha256": sha256(RAW)},
        "finalGuide": {"path": str(FINAL.relative_to(ROOT.parents[1])).replace("\\", "/"), "sha256": sha256(FINAL), "durationSeconds": 10.76},
        "identityPolicy": "Locked Jeju Instagram carrier supplies delivery; the original owner reference remains primary and recording 5 supplements owner identity and legal diction.",
    }
    (PROFILE / "conversion-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
