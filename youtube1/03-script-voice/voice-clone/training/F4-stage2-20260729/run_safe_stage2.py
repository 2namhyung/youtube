"""Run F4 stage-2 r4 training with a 75 C process-tree hard stop."""

from __future__ import annotations

import argparse
import json
import subprocess
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
FISH = Path(r"C:\Users\User\tools\fish-speech")
PYTHON = FISH / "venv" / "Scripts" / "python.exe"
RUN = WORKSPACE / "03-script-voice" / "runs" / "F4-stage2-20260729"
DATASET = ROOT / "fish-dataset-v2"
HARD_LIMIT = 74


def temperature() -> int:
    result = subprocess.run(
        ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
        check=True, capture_output=True, text=True,
    )
    return int(result.stdout.strip().splitlines()[0])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--smoke", action="store_true")
    args = parser.parse_args()
    project = "F4_stage2_20260729_smoke2_r4" if args.smoke else "F4_stage2_20260729_r4"
    result = FISH / "results" / project
    max_steps, interval = (2, 2) if args.smoke else (20, 5)
    start = temperature()
    if start > 52:
        raise SystemExit(f"GPU must cool to <=52 C after the bounded cooldown, current={start}")
    if result.exists():
        raise SystemExit(f"Result directory already exists: {result}")
    command = [
        str(PYTHON), "fish_speech/train.py", "--config-name", "text2semantic_finetune",
        f"project={project}",
        "pretrained_ckpt_path=checkpoints/fish-speech-1.5-F4-target-r8-step40-20260729",
        "model.model.lora_config={_target_:fish_speech.models.text2semantic.lora.LoraConfig,r:4,lora_alpha:8,lora_dropout:0.01}",
        f"train_dataset.proto_files=[{(DATASET / 'protos_train').as_posix()}]",
        f"val_dataset.proto_files=[{(DATASET / 'protos_val').as_posix()}]",
        "max_length=512", "data.batch_size=1", "data.num_workers=1",
        "trainer.accumulate_grad_batches=4", f"trainer.max_steps={max_steps}",
        "trainer.precision=bf16-true", "trainer.strategy=auto",
        f"trainer.val_check_interval={interval}", "trainer.limit_val_batches=2",
        "+trainer.num_sanity_val_steps=1",
        f"callbacks.model_checkpoint.every_n_train_steps={interval}",
        "callbacks.model_checkpoint.save_top_k=6", "model.optimizer.lr=1e-5",
        "+trainer.enable_progress_bar=false", "+trainer.log_every_n_steps=1",
    ]
    RUN.mkdir(parents=True, exist_ok=True)
    prefix = "smoke" if args.smoke else "training"
    stdout_path, stderr_path = RUN / f"{prefix}.stdout.log", RUN / f"{prefix}.stderr.log"
    state = {
        "project": project, "command": command, "stacked_base": command[5],
        "adapter": {"rank": 4, "alpha": 8, "dropout": 0.01},
        "fresh_optimizer": True, "start_temperature_c": start,
        "hard_limit_c": HARD_LIMIT, "poll_interval_seconds": 0.5,
        "max_temperature_c": start, "safety_stopped": False,
        "temperature_samples": [], "resume_permitted_after_safety_stop": False,
    }
    stop = threading.Event()
    with stdout_path.open("w", encoding="utf-8") as stdout, stderr_path.open("w", encoding="utf-8") as stderr:
        process = subprocess.Popen(command, cwd=FISH, stdout=stdout, stderr=stderr, text=True)

        def monitor() -> None:
            while not stop.wait(0.5):
                try:
                    current = temperature()
                    state["max_temperature_c"] = max(state["max_temperature_c"], current)
                    state["temperature_samples"].append({"unix_time": round(time.time(), 3), "c": current})
                    if current > HARD_LIMIT:
                        state["safety_stopped"] = True
                        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True, text=True)
                        return
                except Exception as error:
                    state.setdefault("monitor_errors", []).append(str(error))

        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
        exit_code = process.wait()
        stop.set()
        thread.join(timeout=3)
    state.update({"exit_code": exit_code, "result_dir": str(result), "finished_unix_time": round(time.time(), 3)})
    evidence = RUN / f"{prefix}-safety.json"
    evidence.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "exit_code": exit_code, "safety_stopped": state["safety_stopped"],
        "start_temperature_c": start, "max_temperature_c": state["max_temperature_c"],
        "evidence": str(evidence),
    }, ensure_ascii=False))
    if exit_code or state["safety_stopped"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
