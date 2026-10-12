"""Generate GPT-SoVITS V2 candidates from the bounded S1 fine-tune."""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import traceback
import wave
from pathlib import Path

import soundfile as sf

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent
ROOT = Path(r"C:\Users\User\tools\GPT-SoVITS-official\extracted\GPT-SoVITS-v3lora-20250228")
REF = PILOT / "gpt_ref_trim.wav"
REF_TEXT = "교권보호국은 교권을 보호하는 가상의 기관입니다."
GPT = HERE / "training" / "full" / "weights" / "model-ab-20260729-gpt-v2-full-e2.ckpt"
texts = {"critical": (PILOT / "gpt_critical.txt").read_text(encoding="utf-8"), "heldout": (PILOT / "gpt_heldout.txt").read_text(encoding="utf-8")}


def gpu() -> dict:
    try:
        t, m = subprocess.check_output(["nvidia-smi", "--query-gpu=temperature.gpu,memory.used", "--format=csv,noheader,nounits"], text=True).strip().split(",")[:2]
        return {"temperature_c": float(t), "vram_used_mb": float(m)}
    except Exception as exc:
        return {"error": repr(exc)}


def main() -> None:
    result = {"engine": "GPT-SoVITS V2 S1 fine-tuned candidate", "version": "v2", "tempo": 1.0, "gate": gpu(), "ref_audio": str(REF), "ref_text": REF_TEXT, "texts": texts, "checkpoint": str(GPT)}
    events: list[dict] = []
    stop = threading.Event()
    if result["gate"].get("temperature_c", 999) > 52:
        result["status"] = "blocked_gpu_gate"
        (HERE / "finetuned-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return
    if not GPT.exists():
        raise FileNotFoundError(GPT)

    def monitor() -> None:
        while not stop.is_set():
            event = {"unix_time": time.time(), **gpu()}
            events.append(event)
            if event.get("temperature_c", 0) >= 74:
                (HERE / "finetuned-hard-stop.json").write_text(json.dumps({"event": event, "reason": "GPU temperature >=74C"}, indent=2), encoding="utf-8")
                os._exit(74)
            time.sleep(0.5)

    thread = threading.Thread(target=monitor, daemon=True)
    thread.start()
    try:
        os.chdir(ROOT)
        import sys
        sys.path.insert(0, str(ROOT)); sys.path.insert(0, str(ROOT / "GPT_SoVITS"))
        os.environ.update({"language": "en_US", "version": "v2", "is_half": "True", "gpt_path": str(GPT), "sovits_path": str(ROOT / "GPT_SoVITS" / "pretrained_models" / "gsv-v2final-pretrained" / "s2G2333k.pth")})
        from GPT_SoVITS.inference_webui import change_gpt_weights, change_sovits_weights, get_tts_wav
        change_gpt_weights(gpt_path=str(GPT)); change_sovits_weights(sovits_path=os.environ["sovits_path"])
        for name, text in texts.items():
            chunks = list(get_tts_wav(ref_wav_path=str(REF), prompt_text=REF_TEXT, prompt_language="Korean", text=text, text_language="Korean", top_p=1, temperature=1, speed=1.0, pause_second=0.3))
            if not chunks:
                raise RuntimeError("get_tts_wav returned no chunks")
            sr, data = chunks[-1]
            path = HERE / f"gpt_ft_{name}.wav"
            sf.write(path, data, sr)
            with wave.open(str(path), "rb") as wf:
                dur = wf.getnframes() / wf.getframerate()
            result.setdefault("outputs", {})[name] = {"path": str(path), "sample_rate": sr, "duration_seconds": dur}
        result["status"] = "completed"
    except Exception as exc:
        result["status"] = "error"; result["error"] = repr(exc); result["traceback"] = traceback.format_exc()
    finally:
        stop.set(); thread.join(timeout=1); result["gpu_events"] = events
        result["peak_temperature_c"] = max([e.get("temperature_c", 0) for e in events] or [result["gate"].get("temperature_c", 0)])
        result["peak_vram_used_mb"] = max([e.get("vram_used_mb", 0) for e in events] or [result["gate"].get("vram_used_mb", 0)])
        (HERE / "finetuned-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
