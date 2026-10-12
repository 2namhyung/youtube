"""Rank stored stage-2 checkpoints only by their matching validation events."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from tensorboard.backend.event_processing.event_accumulator import EventAccumulator


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
RESULT = Path(r"C:\Users\User\tools\fish-speech\results\F4_stage2_20260729_r4")
RUN = WORKSPACE / "03-script-voice" / "runs" / "F4-stage2-20260729"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def main() -> None:
    event_files = list((RESULT / "tensorboard").rglob("events.out.tfevents.*"))
    if len(event_files) != 1:
        raise SystemExit(f"expected one event file, found {len(event_files)}")
    events = EventAccumulator(str(event_files[0])).Reload()
    scalar_tags = events.Tags()["scalars"]
    loss_tag = next(tag for tag in scalar_tags if tag.endswith("val/loss") or tag == "val/loss")
    accuracy_tag = next(tag for tag in scalar_tags if "val" in tag and "top_5" in tag)
    losses = {event.step: event.value for event in events.Scalars(loss_tag)}
    accuracies = {event.step: event.value for event in events.Scalars(accuracy_tag)}
    records = []
    for step in (10, 15, 20):
        checkpoint = RESULT / "checkpoints" / f"step_{step:09d}.ckpt"
        if not checkpoint.exists():
            continue
        candidates = [event_step for event_step in losses if event_step in accuracies and abs(event_step - step) <= 1]
        if not candidates:
            raise RuntimeError(f"no matching validation event for checkpoint step {step}")
        event_step = min(candidates, key=lambda value: abs(value - step))
        records.append({
            "step": step, "event_step": event_step,
            "validation_loss": losses[event_step], "validation_top_5_accuracy": accuracies[event_step],
            "checkpoint": str(checkpoint), "checkpoint_sha256": sha256(checkpoint),
        })
    ranked = sorted(records, key=lambda row: (row["validation_loss"], -row["validation_top_5_accuracy"], -row["step"]))
    for rank, row in enumerate(ranked, 1):
        row["rank"] = rank
    evidence = {
        "selection_rule": "stored steps 10/15/20 only; ascending val loss, descending top-5, newest tie-break",
        "event_file": str(event_files[0]), "event_file_sha256": sha256(event_files[0]),
        "scalar_tags": {"loss": loss_tag, "top_5_accuracy": accuracy_tag},
        "ranked_candidates": ranked, "probe_candidates": ranked[:2],
    }
    RUN.mkdir(parents=True, exist_ok=True)
    output = RUN / "validation-ranking.json"
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == "__main__":
    main()
