"""Run a gated, pilot-only GPT-SoVITS V2 S1 fine-tune (smoke then bounded)."""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
FEATURES = HERE / "dataset" / "features"
ROOT = Path(r"C:\Users\User\tools\GPT-SoVITS-official\extracted\GPT-SoVITS-v3lora-20250228")
PYTHON = ROOT / "runtime" / "python.exe"
SCRIPT = ROOT / "GPT_SoVITS" / "s1_train.py"
PRETRAINED = ROOT / "GPT_SoVITS" / "pretrained_models" / "gsv-v2final-pretrained" / "s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt"
OUT = HERE / "training"
CONFIGS = HERE / "configs"


def gpu() -> dict:
    try:
        out = subprocess.check_output(["nvidia-smi", "--query-gpu=temperature.gpu,memory.used", "--format=csv,noheader,nounits"], text=True).strip().split(",")
        return {"temperature_c": float(out[0]), "vram_used_mb": float(out[1])}
    except Exception as exc:
        return {"error": repr(exc)}


def config_for(name: str, epochs: int) -> Path:
    run_dir = OUT / name
    weights = run_dir / "weights"
    weights.mkdir(parents=True, exist_ok=True)
    data = {
        "train": {
            "seed": 1234, "epochs": epochs, "batch_size": 1, "save_every_n_epoch": 1,
        "precision": "16-mixed", "gradient_clip": 1.0, "num_workers": 1,
            "if_save_latest": True, "if_save_every_weights": True,
            "half_weights_save_dir": str(weights), "exp_name": f"model-ab-20260729-gpt-v2-{name}",
        },
        "optimizer": {"lr": 0.01, "lr_init": 0.00001, "lr_end": 0.0001, "warmup_steps": 10, "decay_steps": 1000},
        "data": {"max_eval_sample": 1, "max_sec": 54, "num_workers": 1, "pad_val": 1024},
        "model": {"vocab_size": 1025, "phoneme_vocab_size": 732, "embedding_dim": 512, "hidden_dim": 512,
                  "head": 16, "linear_units": 2048, "n_layer": 24, "dropout": 0, "EOS": 1024, "random_bert": 0},
        "inference": {"top_k": 15},
        "pretrained_s1": str(PRETRAINED),
        "train_semantic_path": str(FEATURES / "6-name2semantic.tsv"),
        "train_phoneme_path": str(FEATURES / "2-name2text.txt"),
        "output_dir": str(run_dir / "logs_s1"),
    }
    CONFIGS.mkdir(parents=True, exist_ok=True)
    path = CONFIGS / f"s1-{name}.yaml"
    path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return path


def run(name: str, epochs: int, events: list[dict]) -> dict:
    initial = gpu()
    result = {"name": name, "epochs": epochs, "initial_gpu": initial}
    if initial.get("temperature_c", 999) > 52:
        result["status"] = "blocked_gpu_gate"
        return result
    config = config_for(name, epochs)
    log = HERE / f"{name}-training.log"
    env = os.environ.copy()
    env.update({"PYTHONUNBUFFERED": "1", "version": "v2", "hz": "25hz", "language": "en_US", "CUDA_VISIBLE_DEVICES": "0"})
    cmd = [str(PYTHON), "-c", "import runpy,sys; sys.path.insert(0,r'%s'); sys.path.insert(0,r'%s'); runpy.run_path(r'%s',run_name='__main__')" % (ROOT, ROOT / "GPT_SoVITS", SCRIPT), "--config_file", str(config)]
    with log.open("w", encoding="utf-8") as stream:
        proc = subprocess.Popen(cmd, cwd=str(ROOT), env=env, stdout=stream, stderr=subprocess.STDOUT)
        hard_stop = None
        while proc.poll() is None:
            event = {"unix_time": time.time(), **gpu(), "name": name}
            events.append(event)
            if event.get("temperature_c", 0) >= 74:
                hard_stop = {"event": event, "reason": "GPU temperature >=74C", "no_resume": True}
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                break
            time.sleep(0.5)
    result.update({"config": str(config), "log": str(log), "returncode": proc.returncode,
                   "status": "hard_stopped" if hard_stop else ("completed" if proc.returncode == 0 else "error"),
                   "hard_stop": hard_stop,
                   "peak_temperature_c": max([x.get("temperature_c", 0) for x in events if x.get("name") == name] or [initial.get("temperature_c", 0)]),
                   "peak_vram_used_mb": max([x.get("vram_used_mb", 0) for x in events if x.get("name") == name] or [initial.get("vram_used_mb", 0)])})
    return result


def main() -> None:
    for path in (PYTHON, SCRIPT, PRETRAINED, FEATURES / "2-name2text.txt", FEATURES / "6-name2semantic.tsv"):
        if not path.exists():
            raise FileNotFoundError(path)
    OUT.mkdir(parents=True, exist_ok=True)
    events: list[dict] = []
    smoke = run("smoke", 1, events)
    result = {"engine": "GPT-SoVITS V2 S1", "policy": "pilot-only; no production connection", "smoke": smoke, "events": events}
    if smoke["status"] != "completed":
        result["status"] = "smoke_failed_or_blocked"
        (HERE / "train-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        return
    full = run("full", 2, events)
    result["full"] = full
    result["status"] = "completed" if full["status"] == "completed" else full["status"]
    (HERE / "train-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
