"""Run the official GPT-SoVITS V2 feature preparation in pilot-owned paths."""
from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATASET = HERE / "dataset"
FEATURES = DATASET / "features"
ROOT = Path(r"C:\Users\User\tools\GPT-SoVITS-official\extracted\GPT-SoVITS-v3lora-20250228")
PYTHON = ROOT / "runtime" / "python.exe"
PREP = ROOT / "GPT_SoVITS" / "prepare_datasets"
ROBERTA = ROOT / "GPT_SoVITS" / "pretrained_models" / "chinese-roberta-wwm-ext-large"
HUBERT = ROOT / "GPT_SoVITS" / "pretrained_models" / "chinese-hubert-base"
S2G = ROOT / "GPT_SoVITS" / "pretrained_models" / "gsv-v2final-pretrained" / "s2G2333k.pth"
S2CONFIG = ROOT / "GPT_SoVITS" / "configs" / "s2.json"
RESULT = HERE / "prep-result.json"


def gpu() -> dict:
    try:
        out = subprocess.check_output(
            ["nvidia-smi", "--query-gpu=temperature.gpu,memory.used", "--format=csv,noheader,nounits"],
            text=True,
        ).strip().split(",")
        return {"temperature_c": float(out[0]), "vram_used_mb": float(out[1])}
    except Exception as exc:
        return {"error": repr(exc)}


def run_stage(name: str, script: Path, env: dict, events: list[dict], hard_stop: dict) -> dict:
    log = HERE / f"{name}.log"
    proc = subprocess.Popen(
        [str(PYTHON), "-c", "import runpy,sys; sys.path.insert(0,r'%s'); sys.path.insert(0,r'%s'); runpy.run_path(r'%s',run_name='__main__')" % (ROOT, ROOT / "GPT_SoVITS", script)], cwd=str(ROOT), env=env,
        stdout=log.open("w", encoding="utf-8"), stderr=subprocess.STDOUT,
    )
    while proc.poll() is None:
        event = {"unix_time": time.time(), **gpu(), "stage": name}
        events.append(event)
        if event.get("temperature_c", 0) >= 74:
            hard_stop.update({"stage": name, "event": event, "reason": "GPU temperature >=74C"})
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            break
        time.sleep(0.5)
    return {"stage": name, "returncode": proc.returncode, "log": str(log), "hard_stop": bool(hard_stop)}


def main() -> None:
    initial = gpu()
    result = {"engine": "GPT-SoVITS V2 official prepare_datasets", "initial_gpu": initial, "stages": []}
    if initial.get("temperature_c", 999) > 52:
        result["status"] = "blocked_gpu_gate"
        RESULT.write_text(json.dumps(result, indent=2), encoding="utf-8")
        return
    for path in (PYTHON, PREP / "1-get-text.py", PREP / "2-get-hubert-wav32k.py", PREP / "3-get-semantic.py", ROBERTA, HUBERT, S2G, S2CONFIG):
        if not path.exists():
            raise FileNotFoundError(path)
    FEATURES.mkdir(parents=True, exist_ok=True)
    base_env = os.environ.copy()
    base_env.update({
        "PYTHONUNBUFFERED": "1", "inp_text": str(DATASET / "1-text-list.txt"),
        "inp_wav_dir": "", "exp_name": "model-ab-20260729-gpt-v2", "i_part": "0", "all_parts": "1",
        "opt_dir": str(FEATURES), "bert_pretrained_dir": str(ROBERTA), "cnhubert_base_dir": str(HUBERT),
        "pretrained_s2G": str(S2G), "s2config_path": str(S2CONFIG), "is_half": "True",
        "version": "v2", "hz": "25hz", "language": "en_US",
    })
    base_env["PYTHONPATH"] = os.pathsep.join([str(ROOT), str(ROOT / "GPT_SoVITS"), base_env.get("PYTHONPATH", "")])
    events: list[dict] = []
    hard_stop: dict = {}
    for name, script in (("stage1_text", PREP / "1-get-text.py"), ("stage2_hubert", PREP / "2-get-hubert-wav32k.py"), ("stage3_semantic", PREP / "3-get-semantic.py")):
        info = run_stage(name, script, base_env, events, hard_stop)
        result["stages"].append(info)
        if info["returncode"] != 0 or hard_stop:
            result["status"] = "hard_stopped" if hard_stop else "error"
            result["gpu_events"] = events
            result["hard_stop"] = hard_stop
            RESULT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            return
    # The official script emits part-suffixed files; s1_train.py expects these names.
    for source, target in ((FEATURES / "2-name2text-0.txt", FEATURES / "2-name2text.txt"), (FEATURES / "6-name2semantic-0.tsv", FEATURES / "6-name2semantic.tsv")):
        if not source.exists():
            raise FileNotFoundError(source)
        target.write_bytes(source.read_bytes())
    result.update({"status": "completed", "gpu_events": events, "hard_stop": hard_stop,
                   "peak_temperature_c": max([e.get("temperature_c", 0) for e in events] or [initial.get("temperature_c", 0)]),
                   "peak_vram_used_mb": max([e.get("vram_used_mb", 0) for e in events] or [initial.get("vram_used_mb", 0)])})
    RESULT.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
