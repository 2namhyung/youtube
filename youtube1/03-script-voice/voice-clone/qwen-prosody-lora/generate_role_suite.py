"""Generate five matched base/adapter role pairs; no checkpoint export."""
from __future__ import annotations

import argparse
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

OUT = ROOT / "outputs" / "role_suite"
RAW = OUT / "raw"
TRAIN_REPORT = ROOT / "outputs" / "perceptual_training_report.json"
REFERENCE = ROOT.parent / "pilots" / "model-ab-20260729" / "f4_ref_gyogwon.wav"
REFERENCE_SHA256 = "31B3FDEE6E1417DAEE8DD863F479B01408A840CC21762C2927E2A3C97B4A4646"
REFERENCE_TEXT = "교권보호국은 교권을 보호하는 가상의 기관입니다. 현실의 교권 보호 제도는 제대로 작동하고 있을까요? 교권과 권한은 서로 다른 의미를 가집니다."
SEED = 20260730
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
MODEL_REVISION = "5d83992436eae1d760afd27aff78a71d676296fc"
ROLES = {
    "hook": "교실에서 선생님의 말 한마디가 녹음되고, 순식간에 민원으로 돌아오는 시대입니다. 그런데 교권을 지키는 제도는 정말 현장에서 작동하고 있을까요?",
    "news_exposition": "교육부는 교권 보호 대책을 확대하고, 학교마다 대응 절차를 마련했다고 설명합니다. 하지만 신고부터 조사와 지원까지 이어지는 과정은 지역과 학교에 따라 큰 차이를 보입니다.",
    "tension": "문제는 사건이 벌어진 다음입니다. 교사는 수업을 계속해야 하지만 보호 절차는 늦어지고, 책임을 둘러싼 갈등은 점점 더 커집니다.",
    "criticism": "대책은 많아졌지만 현장의 부담을 개인에게 남겨 둔다면, 제도는 이름만 바뀐 채 같은 문제를 반복하게 됩니다. 실적보다 실제 대응 속도와 회복 과정을 따져봐야 합니다.",
    "solution_closing": "해법은 교사의 권한과 책임을 분명히 하고, 사건 초기부터 법률과 심리 지원을 함께 연결하는 데 있습니다. 교권 보호는 누군가를 공격하는 일이 아니라, 교실의 신뢰를 다시 세우는 일입니다.",
}


def load_base():
    return Qwen3TTSModel.from_pretrained(
        str(local_model_path()), device_map="cuda:0", dtype=torch.bfloat16,
        attn_implementation="sdpa", local_files_only=True,
    )


def generate(model, text: str, output: Path) -> dict:
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)
    wavs, sr = model.generate_voice_clone(
        text=text, language="Korean", ref_audio=str(REFERENCE), ref_text=REFERENCE_TEXT,
        x_vector_only_mode=False, non_streaming_mode=True, speed=1.0,
    )
    waveform = np.asarray(wavs[0], dtype=np.float32)
    if sr != 24000 or waveform.ndim != 1 or not len(waveform) or not np.isfinite(waveform).all():
        raise PilotStop("invalid generated waveform")
    if float(np.max(np.abs(waveform))) >= 1.0:
        raise PilotStop("raw generated waveform clips")
    sf.write(output, waveform, sr, subtype="PCM_16")
    return {
        "path": str(output.resolve()), "sha256": sha256(output), "sample_rate": sr,
        "duration_seconds": len(waveform) / sr, "peak": float(np.max(np.abs(waveform))),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--variant", choices=("base", "adapter"), required=True)
    args = parser.parse_args()
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    original_start_free = config["runtime"]["min_free_vram_mib"]
    config["runtime"]["min_free_vram_mib"] = 5400
    training = json.loads(TRAIN_REPORT.read_text(encoding="utf-8"))
    adapter = Path(training.get("adapter", {}).get("path", ""))
    if training.get("status") != "pass" or not training.get("adapter", {}).get("saved") or not adapter.is_dir():
        raise PilotStop("missing validation-gated adapter")
    if sha256(REFERENCE).lower() != REFERENCE_SHA256.lower():
        raise PilotStop("canonical reference hash mismatch")
    if training["adapter"]["files"]["adapter_model.safetensors"] != sha256(adapter / "adapter_model.safetensors"):
        raise PilotStop("adapter weight hash mismatch")
    RAW.mkdir(parents=True, exist_ok=True)
    partial_path = OUT / f"generation_{args.variant}.json"
    report = {
        "status": "running", "support": "unsupported-experimental", "variant": args.variant,
        "model_id": MODEL_ID, "model_revision": MODEL_REVISION, "seed": SEED,
        "decoding": {"language": "Korean", "speed": 1.0, "x_vector_only_mode": False,
                     "non_streaming_mode": True, "attention": "sdpa", "dtype": "bfloat16"},
        "reference_audio": str(REFERENCE.resolve()), "reference_sha256": sha256(REFERENCE),
        "reference_text": REFERENCE_TEXT, "roles": {},
        "watchdog_exception": {
            "scope": "inference-only five-role suite",
            "original_min_start_free_mib": original_start_free,
            "authorized_min_start_free_mib": 5400,
            "unchanged_max_physical_used_mib": config["runtime"]["max_used_vram_mib"],
            "unchanged_max_torch_reserved_mib": config["runtime"]["max_peak_reserved_mib"],
            "unchanged_max_temperature_c": config["runtime"]["max_gpu_temperature_c"],
        },
        "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        watchdog(config, f"role-suite-{args.variant}-preload", require_start_free=True)
        model = load_base()
        if args.variant == "adapter":
            model.model.talker = PeftModel.from_pretrained(
                model.model.talker, adapter, is_trainable=False, local_files_only=True
            ).merge_and_unload(safe_merge=True)
            if any("lora_" in name for name, _ in model.model.talker.named_parameters()):
                raise PilotStop("in-memory merge left LoRA parameters attached")
        for role, text in ROLES.items():
            report["roles"][role] = {
                "text": text,
                "audio": generate(model, text, RAW / f"{role}_{args.variant}.wav"),
                "gpu": watchdog(config, f"role-suite-{args.variant}-{role}"),
            }
            print(json.dumps({"variant": args.variant, "role": role, "status": "generated"}), flush=True)
        report["merge"] = {
            "mode": "none" if args.variant == "base" else "in-memory PEFT merge_and_unload",
            "merged_checkpoint_saved": False, "production_integration": False,
        }
        report["status"] = "pass"
    except Exception as exc:
        report["status"] = "blocked"
        report["blocker"] = {"type": type(exc).__name__, "message": str(exc)}
    finally:
        report["finished_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        partial_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        try:
            del model
        except UnboundLocalError:
            pass
        gc.collect()
        torch.cuda.empty_cache()
    print(json.dumps({"status": report["status"], "report": str(partial_path)}))
    if report["status"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
