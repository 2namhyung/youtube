"""Conservative validation-gated perceptual LoRA run; no production export."""
from __future__ import annotations

import json
import math
import time
from pathlib import Path

import torch
from torch.optim import AdamW

from pilot import ROOT, PilotStop, load_and_wrap, loss_for_batch, make_loader, sha256, watchdog

TRAIN = ROOT / "perceptual_data" / "train_with_codes.jsonl"
VALIDATION = ROOT / "perceptual_data" / "validation_with_codes.jsonl"
AUDIT = ROOT / "perceptual_data" / "dataset_audit.json"
OUT = ROOT / "outputs"
MAX_OPTIMIZER_STEPS = 16
EVAL_INTERVAL = 4
LR = 1e-5
MAX_VALIDATION_REGRESSION = 1.02
SEED = 20260730


def evaluate(core, talker, batches) -> tuple[list[float], float]:
    core.eval()
    with torch.no_grad():
        losses = [float(loss_for_batch(core, talker, batch)) for batch in batches]
    if not losses or not all(math.isfinite(value) for value in losses):
        raise PilotStop("validation loss is empty or non-finite")
    return losses, sum(losses) / len(losses)


def main() -> None:
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    audit = json.loads(AUDIT.read_text(encoding="utf-8"))
    report = {
        "status": "running", "support": "unsupported-experimental", "seed": SEED,
        "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "config": {"rank": 4, "alpha": 8, "learning_rate": LR, "batch_size": 1,
                   "gradient_accumulation_steps": config["runtime"]["gradient_accumulation_steps"],
                   "max_optimizer_steps": MAX_OPTIMIZER_STEPS, "eval_interval": EVAL_INTERVAL,
                   "max_validation_regression": MAX_VALIDATION_REGRESSION},
        "inputs": {"train_jsonl": str(TRAIN), "train_jsonl_sha256": sha256(TRAIN),
                   "validation_jsonl": str(VALIDATION), "validation_jsonl_sha256": sha256(VALIDATION),
                   "dataset_audit_sha256": sha256(AUDIT), "dataset_counts": audit["counts"],
                   "protected_validation": audit["protected_validation"]},
    }
    try:
        torch.manual_seed(SEED)
        torch.cuda.manual_seed_all(SEED)
        watchdog(config, "perceptual-preload", require_start_free=True)
        torch.cuda.reset_peak_memory_stats()
        loaded, talker, targets = load_and_wrap(config)
        train_batches = list(make_loader(TRAIN, loaded, config))
        validation_batches = list(make_loader(VALIDATION, loaded, config))
        baseline_losses, baseline_mean = evaluate(loaded.model, talker, validation_batches)
        parameters = [parameter for parameter in loaded.model.parameters() if parameter.requires_grad]
        optimizer = AdamW(parameters, lr=LR, weight_decay=0.0)
        accumulation = config["runtime"]["gradient_accumulation_steps"]
        micro_limit = MAX_OPTIMIZER_STEPS * accumulation
        generator = torch.Generator().manual_seed(SEED)
        order = torch.randperm(len(train_batches), generator=generator).tolist()
        train_losses, evals = [], []
        best_val, best_step, best_state = baseline_mean, 0, None
        optimizer.zero_grad(set_to_none=True)
        loaded.model.train()
        for micro_step in range(micro_limit):
            if micro_step and micro_step % len(order) == 0:
                order = torch.randperm(len(train_batches), generator=generator).tolist()
            batch = train_batches[order[micro_step % len(order)]]
            loss = loss_for_batch(loaded.model, talker, batch)
            if not torch.isfinite(loss):
                raise PilotStop(f"non-finite train loss at microstep {micro_step + 1}")
            (loss / accumulation).backward()
            train_losses.append(float(loss.detach()))
            if (micro_step + 1) % accumulation:
                continue
            optimizer_step = (micro_step + 1) // accumulation
            grad_norm = torch.nn.utils.clip_grad_norm_(parameters, 1.0)
            if not torch.isfinite(grad_norm):
                raise PilotStop(f"non-finite gradient norm at optimizer step {optimizer_step}")
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)
            gpu = watchdog(config, f"optimizer-step-{optimizer_step}")
            if optimizer_step % EVAL_INTERVAL == 0:
                val_losses, val_mean = evaluate(loaded.model, talker, validation_batches)
                evals.append({"optimizer_step": optimizer_step, "losses": val_losses, "mean": val_mean, "gpu": gpu})
                if val_mean < best_val:
                    best_val, best_step = val_mean, optimizer_step
                    best_state = {name: parameter.detach().cpu().clone() for name, parameter in loaded.model.named_parameters() if parameter.requires_grad}
                if val_mean > baseline_mean * MAX_VALIDATION_REGRESSION:
                    raise PilotStop(f"validation materially worsened at step {optimizer_step}: {val_mean} > {baseline_mean * MAX_VALIDATION_REGRESSION}")
                loaded.model.train()
        first_window = sum(train_losses[:16]) / min(16, len(train_losses))
        last_window = sum(train_losses[-16:]) / min(16, len(train_losses))
        if best_state is None or best_step == 0:
            raise PilotStop("no trained checkpoint improved validation")
        if last_window > first_window * 1.05:
            raise PilotStop("training loss materially worsened")
        for name, parameter in loaded.model.named_parameters():
            if name in best_state:
                parameter.data.copy_(best_state[name].to(parameter.device, dtype=parameter.dtype))
        restored_losses, restored_mean = evaluate(loaded.model, talker, validation_batches)
        if restored_mean > baseline_mean * MAX_VALIDATION_REGRESSION:
            raise PilotStop("restored best adapter materially worsens validation")
        adapter_dir = OUT / f"perceptual_adapter_rank4_step{best_step}"
        if adapter_dir.exists():
            raise PilotStop(f"refusing to overwrite adapter directory: {adapter_dir}")
        loaded.model.talker.save_pretrained(adapter_dir, safe_serialization=True)
        adapter_files = {path.name: sha256(path) for path in sorted(adapter_dir.iterdir()) if path.is_file()}
        report["status"] = "pass"
        report["training"] = {"optimizer_steps": MAX_OPTIMIZER_STEPS, "micro_steps": micro_limit,
                              "first_16_train_loss_mean": first_window, "last_16_train_loss_mean": last_window,
                              "all_losses_finite": True, "evals": evals}
        report["validation"] = {"baseline_losses": baseline_losses, "baseline_mean": baseline_mean,
                                "best_step": best_step, "best_mean": best_val,
                                "restored_losses": restored_losses, "restored_mean": restored_mean,
                                "material_regression_limit": baseline_mean * MAX_VALIDATION_REGRESSION}
        report["adapter"] = {"saved": True, "path": str(adapter_dir.resolve()), "files": adapter_files,
                             "target_module_count": len(targets)}
        report["watchdog"] = {"torch_peak_allocated_mib": round(torch.cuda.max_memory_allocated() / 1024**2, 2),
                              "torch_peak_reserved_mib": round(torch.cuda.max_memory_reserved() / 1024**2, 2),
                              "final_gpu": watchdog(config, "perceptual-finish")}
    except Exception as exc:
        report["status"] = "blocked"
        report["blocker"] = {"type": type(exc).__name__, "message": str(exc)}
    finally:
        OUT.mkdir(parents=True, exist_ok=True)
        report["finished_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        (OUT / "perceptual_training_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "report": str(OUT / "perceptual_training_report.json"), "blocker": report.get("blocker")}))
    if report["status"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
