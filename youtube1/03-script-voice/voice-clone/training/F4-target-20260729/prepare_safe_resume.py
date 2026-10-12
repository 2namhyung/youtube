"""Prepare a low-LR full-state copy of the immutable F4 step-40 checkpoint."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import torch


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
RUN = WORKSPACE / "03-script-voice" / "runs" / "F4-target-20260729"
ORIGINAL = Path(r"C:\Users\User\tools\fish-speech\results\F4_salvage_20260729_r8\checkpoints\step_000000040.ckpt")
OUTPUT = ROOT / "resume" / "step_000000040_lr_1p5e-5.ckpt"
LR = 1.5e-5


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main() -> None:
    original_before = sha256(ORIGINAL)
    checkpoint = torch.load(ORIGINAL, map_location="cpu")
    required = ("state_dict", "optimizer_states", "lr_schedulers", "loops", "global_step")
    missing = [key for key in required if key not in checkpoint]
    if missing or checkpoint["global_step"] != 40:
        raise SystemExit(f"Unsafe continuation checkpoint: missing={missing}, step={checkpoint.get('global_step')}")
    old_optimizer_lrs = []
    for optimizer in checkpoint["optimizer_states"]:
        for group in optimizer["param_groups"]:
            old_optimizer_lrs.append(group["lr"])
            group["lr"] = LR
            group["initial_lr"] = LR
    old_scheduler = []
    for scheduler in checkpoint["lr_schedulers"]:
        old_scheduler.append({
            "base_lrs": scheduler.get("base_lrs"),
            "last_epoch": scheduler.get("last_epoch"),
            "last_lr": scheduler.get("_last_lr"),
        })
        scheduler["base_lrs"] = [LR for _ in scheduler.get("base_lrs", old_optimizer_lrs)]
        scheduler["_last_lr"] = [LR for _ in scheduler.get("_last_lr", old_optimizer_lrs)]
        if scheduler.get("last_epoch") != checkpoint["global_step"]:
            raise SystemExit("Scheduler last_epoch does not match global_step")
    old_callbacks = checkpoint.get("callbacks", {})
    checkpoint["callbacks"] = {}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    torch.save(checkpoint, OUTPUT)
    original_after = sha256(ORIGINAL)
    if original_before != original_after:
        raise SystemExit("Original step-40 checkpoint changed")
    verify = torch.load(OUTPUT, map_location="cpu")
    report = {
        "schema_version": 1,
        "decision": "SAFE_FULL_STATE_CONTINUATION_COPY",
        "original_checkpoint": str(ORIGINAL),
        "original_sha256_before": original_before,
        "original_sha256_after": original_after,
        "original_unchanged": original_before == original_after,
        "resume_checkpoint": str(OUTPUT),
        "resume_checkpoint_sha256": sha256(OUTPUT),
        "global_step": verify["global_step"],
        "epoch": verify["epoch"],
        "state_dict_entries": len(verify["state_dict"]),
        "optimizer_state_count": len(verify["optimizer_states"]),
        "optimizer_lrs_before": old_optimizer_lrs,
        "optimizer_lrs_after": [
            group["lr"] for state in verify["optimizer_states"] for group in state["param_groups"]
        ],
        "optimizer_initial_lrs_after": [
            group["initial_lr"] for state in verify["optimizer_states"] for group in state["param_groups"]
        ],
        "scheduler_before": old_scheduler,
        "scheduler_after": verify["lr_schedulers"],
        "loops_preserved": bool(verify["loops"]),
        "callbacks_removed": len(old_callbacks),
        "callback_removal_reason": (
            "ModelCheckpoint callback state contains only old output-directory ranking/path metadata; "
            "removing it prevents writes/ranking against the prior run and does not alter model, "
            "optimizer, scheduler, loop, epoch, or global-step state."
        ),
        "intended_total_max_steps": 70,
        "maximum_additional_optimizer_steps": 30,
    }
    RUN.mkdir(parents=True, exist_ok=True)
    (RUN / "safe-resume.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(OUTPUT), "sha256": report["resume_checkpoint_sha256"],
        "global_step": report["global_step"], "lr": report["optimizer_lrs_after"],
        "original_unchanged": report["original_unchanged"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
