from __future__ import annotations

import json
import os
import random
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
COSYVOICE_ROOT = ROOT / "vendor" / "CosyVoice"
MATCHA_ROOT = COSYVOICE_ROOT / "third_party" / "Matcha-TTS"
MODEL_DIR = ROOT / "models" / "Fun-CosyVoice3-0.5B"
OUT_DIR = Path(__file__).resolve().parent
PROMPT = ROOT / "samples" / "f-comparison-v2" / "F-prompt.wav"
SOURCES = {
    "C": ROOT / "samples" / "f-trained-model-vc" / "provenance" / "C-carrier.wav",
    "E": ROOT / "samples" / "f-trained-model-vc" / "provenance" / "E-carrier.wav",
}

os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
os.environ.setdefault("HF_HOME", str(ROOT / "cache" / "huggingface"))
os.environ.setdefault("MODELSCOPE_CACHE", str(ROOT / "cache" / "modelscope"))
sys.path.insert(0, str(COSYVOICE_ROOT))
sys.path.insert(0, str(MATCHA_ROOT))


def main() -> None:
    import torch
    import torchaudio
    from cosyvoice.cli.cosyvoice import AutoModel

    seed = 20260726
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)

    model = AutoModel(
        model_dir=str(MODEL_DIR),
        load_trt=False,
        load_vllm=False,
        fp16=torch.cuda.is_available(),
    )
    results: dict[str, object] = {
        "engine": "Fun-CosyVoice3 inference_vc",
        "modelDir": str(MODEL_DIR),
        "prompt": str(PROMPT),
        "seed": seed,
        "speed": 1.0,
        "device": "cuda-fp16" if torch.cuda.is_available() else "cpu-fp32",
        "outputs": {},
    }
    for label, source in SOURCES.items():
        chunks = [
            item["tts_speech"].detach().cpu()
            for item in model.inference_vc(
                str(source), str(PROMPT), stream=False, speed=1.0
            )
        ]
        if not chunks:
            raise RuntimeError(f"CosyVoice returned no audio for {source}")
        speech = torch.cat(chunks, dim=1)
        output = OUT_DIR / "raw" / f"F-from-{label}-raw.wav"
        torchaudio.save(str(output), speech, model.sample_rate)
        results["outputs"][label] = {
            "source": str(source),
            "output": str(output),
            "sampleRate": model.sample_rate,
            "samples": int(speech.shape[1]),
            "durationSeconds": speech.shape[1] / model.sample_rate,
        }
        print(json.dumps(results["outputs"][label], ensure_ascii=False), flush=True)

    (OUT_DIR / "raw" / "inference.json").write_text(
        json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
