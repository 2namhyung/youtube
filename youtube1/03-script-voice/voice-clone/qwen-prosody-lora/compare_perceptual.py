"""Generate matched base/adapter Korean WAVs using in-memory PEFT merge only."""
from __future__ import annotations

import gc
import json
import random
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch

from pilot import ROOT, PilotStop, local_model_path, sha256, watchdog
from peft import PeftModel
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel

OUT = ROOT / "outputs" / "comparison"
TRAIN_REPORT = ROOT / "outputs" / "perceptual_training_report.json"
REFERENCE = ROOT.parent / "pilots" / "model-ab-20260729" / "f4_ref_gyogwon.wav"
REFERENCE_SHA256 = "31B3FDEE6E1417DAEE8DD863F479B01408A840CC21762C2927E2A3C97B4A4646"
REFERENCE_TEXT = "교권보호국은 교권을 보호하는 가상의 기관입니다. 현실의 교권 보호 제도는 제대로 작동하고 있을까요? 교권과 권한은 서로 다른 의미를 가집니다."
TEXT = "교권보호국은 교권을 보호하는 가상의 기관입니다."
SEED = 20260730


def load_base():
    return Qwen3TTSModel.from_pretrained(
        str(local_model_path()), device_map="cuda:0", dtype=torch.bfloat16,
        attn_implementation="sdpa", local_files_only=True,
    )


def generate(model, output: Path) -> dict:
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)
    wavs, sr = model.generate_voice_clone(
        text=TEXT, language="Korean", ref_audio=str(REFERENCE), ref_text=REFERENCE_TEXT,
        x_vector_only_mode=False, non_streaming_mode=True, speed=1.0,
    )
    waveform = np.asarray(wavs[0], dtype=np.float32)
    if sr != 24000 or waveform.ndim != 1 or len(waveform) == 0 or not np.isfinite(waveform).all():
        raise PilotStop("invalid generated waveform")
    if float(np.max(np.abs(waveform))) >= 1.0:
        raise PilotStop("generated waveform clips")
    sf.write(str(output), waveform, sr, subtype="PCM_16")
    return {"path": str(output.resolve()), "sha256": sha256(output), "sample_rate": sr,
            "duration_seconds": len(waveform) / sr, "peak": float(np.max(np.abs(waveform)))}


def main() -> None:
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    training = json.loads(TRAIN_REPORT.read_text(encoding="utf-8"))
    report = {"status": "running", "support": "unsupported-experimental", "seed": SEED,
              "text": TEXT, "reference_text": REFERENCE_TEXT, "reference_audio": str(REFERENCE.resolve()),
              "reference_sha256": sha256(REFERENCE), "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    try:
        if training.get("status") != "pass" or not training.get("adapter", {}).get("saved"):
            raise PilotStop("comparison requires a validation-gated adapter")
        if report["reference_sha256"].lower() != REFERENCE_SHA256.lower():
            raise PilotStop("canonical reference hash mismatch")
        adapter = Path(training["adapter"]["path"])
        if not adapter.is_dir():
            raise PilotStop("adapter directory missing")
        OUT.mkdir(parents=True, exist_ok=True)
        watchdog(config, "base-generation-preload", require_start_free=True)
        base = load_base()
        report["base"] = generate(base, OUT / "base.wav")
        report["base_gpu"] = watchdog(config, "base-generation-finish")
        del base
        gc.collect()
        torch.cuda.empty_cache()

        watchdog(config, "adapter-generation-preload", require_start_free=True)
        adapted = load_base()
        peft_talker = PeftModel.from_pretrained(adapted.model.talker, adapter, is_trainable=False, local_files_only=True)
        adapted.model.talker = peft_talker.merge_and_unload(safe_merge=True)
        if any("lora_" in name for name, _ in adapted.model.talker.named_parameters()):
            raise PilotStop("in-memory merge left LoRA parameters attached")
        report["adapter"] = generate(adapted, OUT / "adapter.wav")
        report["adapter_gpu"] = watchdog(config, "adapter-generation-finish")
        report["merge"] = {"mode": "in-memory PeftModel.from_pretrained + merge_and_unload", "merged_checkpoint_saved": False,
                           "production_integration": False}
        report["status"] = "pass"
    except Exception as exc:
        report["status"] = "blocked"
        report["blocker"] = {"type": type(exc).__name__, "message": str(exc)}
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        report["finished_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        (OUT / "generation_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "report": str(OUT / "generation_report.json"), "blocker": report.get("blocker")}))
    if report["status"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
