"""Run the 30-step F4 target continuation with a 78 C process-tree stop."""

from __future__ import annotations

import json
import subprocess
import threading
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
FISH = Path(r"C:\Users\User\tools\fish-speech")
PYTHON = FISH / "venv" / "Scripts" / "python.exe"
RUN_EVIDENCE = WORKSPACE / "03-script-voice" / "runs" / "F4-target-20260729"
PROJECT = "F4_target_remediation_20260729_continue40_r8"
RESULT = FISH / "results" / PROJECT
RESUME = ROOT / "resume" / "step_000000040_lr_1p5e-5.ckpt"
HARD_LIMIT = 78


def temperature() -> int:
    result = subprocess.run(
        ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
        check=True, capture_output=True, text=True,
    )
    return int(result.stdout.strip().splitlines()[0])


def main() -> None:
    start_temperature = temperature()
    if start_temperature > 55:
        raise SystemExit(f"GPU must cool to <=55 C, current={start_temperature}")
    if RESULT.exists():
        raise SystemExit(f"Result directory already exists: {RESULT}")
    command = [
        str(PYTHON), "fish_speech/train.py", "--config-name", "text2semantic_finetune",
        f"project={PROJECT}", "pretrained_ckpt_path=checkpoints/fish-speech-1.5",
        "+lora@model.model.lora_config=r_8_alpha_16",
        f"train_dataset.proto_files=[{ROOT / 'fish-dataset' / 'protos_train'}]",
        f"val_dataset.proto_files=[{ROOT / 'fish-dataset' / 'protos_val'}]",
        f"+ckpt_path={RESUME}", "+resume_weights_only=false", "max_length=512",
        "data.batch_size=1", "data.num_workers=1", "trainer.accumulate_grad_batches=4",
        "trainer.max_steps=70", "trainer.precision=bf16-true", "trainer.strategy=auto",
        "trainer.val_check_interval=10", "trainer.limit_val_batches=2",
        "+trainer.num_sanity_val_steps=1", "callbacks.model_checkpoint.every_n_train_steps=10",
        "callbacks.model_checkpoint.save_top_k=4", "model.optimizer.lr=1.5e-5",
        "+trainer.enable_progress_bar=false", "+trainer.log_every_n_steps=1",
    ]
    RUN_EVIDENCE.mkdir(parents=True, exist_ok=True)
    stdout_path = RUN_EVIDENCE / "training.stdout.log"
    stderr_path = RUN_EVIDENCE / "training.stderr.log"
    state = {
        "project": PROJECT, "command": command, "start_temperature_c": start_temperature,
        "hard_limit_c": HARD_LIMIT, "max_temperature_c": start_temperature,
        "safety_stopped": False, "temperature_samples": [],
    }
    stop = threading.Event()
    with stdout_path.open("w", encoding="utf-8") as stdout, stderr_path.open("w", encoding="utf-8") as stderr:
        process = subprocess.Popen(command, cwd=FISH, stdout=stdout, stderr=stderr, text=True)

        def monitor() -> None:
            while not stop.wait(1.0):
                try:
                    current = temperature()
                    state["max_temperature_c"] = max(state["max_temperature_c"], current)
                    state["temperature_samples"].append({"unix_time": round(time.time(), 3), "c": current})
                    if current > HARD_LIMIT:
                        state["safety_stopped"] = True
                        subprocess.run(
                            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                            capture_output=True, text=True,
                        )
                        return
                except Exception as error:
                    state.setdefault("monitor_errors", []).append(str(error))

        thread = threading.Thread(target=monitor, daemon=True)
        thread.start()
        exit_code = process.wait()
        stop.set()
        thread.join(timeout=3)
    state["exit_code"] = exit_code
    state["result_dir"] = str(RESULT)
    state["resume_checkpoint"] = str(RESUME)
    state["finished_unix_time"] = round(time.time(), 3)
    output = RUN_EVIDENCE / "training-safety.json"
    output.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "exit_code": exit_code, "safety_stopped": state["safety_stopped"],
        "start_temperature_c": start_temperature, "max_temperature_c": state["max_temperature_c"],
        "evidence": str(output),
    }, ensure_ascii=False))
    if exit_code or state["safety_stopped"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
