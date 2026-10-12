"""Create strict dual-ASR evidence for the only eligible F4 stage-2 candidate."""

from __future__ import annotations

import hashlib
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
RUN = WORKSPACE / "03-script-voice" / "runs" / "F4-stage2-20260729"
SOURCE_EVALUATOR = ROOT.parent / "F4-target-20260729" / "evaluate_target_result.py"
spec = importlib.util.spec_from_file_location("f4_target_evaluator", SOURCE_EVALUATOR)
contract = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(contract)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def transcript(engine: str, probe: str) -> str:
    path = RUN / "probes" / "f4-stage2-step10" / f"asr-{engine}" / f"{probe}.asr.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    return " ".join(segment["text"].strip() for segment in payload["segments"])


def main() -> None:
    merged = Path(r"C:\Users\User\tools\fish-speech\checkpoints\fish-speech-1.5-F4-stage2-r4-step10-20260729")
    checkpoint = Path(r"C:\Users\User\tools\fish-speech\results\F4_stage2_20260729_r4\checkpoints\step_000000010.ckpt")
    generation_path = RUN / "probes" / "f4-stage2-step10" / "generation.json"
    generation = json.loads(generation_path.read_text(encoding="utf-8"))
    engines = {}
    for engine in ("primary", "turbo"):
        critical = transcript(engine, "critical")
        heldout = transcript(engine, "heldout")
        engines[engine] = {
            "critical_transcript": critical,
            "critical_full_text_exact": contract.normalize(critical) == contract.normalize(contract.CRITICAL_TEXT),
            "critical_tokens": {
                token: contract.normalize(token) in contract.normalize(critical) for token in contract.TOKENS
            },
            "heldout_transcript": heldout,
            "heldout_full_text_exact": contract.normalize(heldout) == contract.normalize(contract.HELDOUT_TEXT),
        }
    strict = all(
        row["critical_full_text_exact"] and row["heldout_full_text_exact"]
        and all(row["critical_tokens"].values()) for row in engines.values()
    )
    manifest = ROOT / "fish-dataset-v2" / "dataset_manifest.json"
    admission = WORKSPACE / "03-script-voice" / "runs" / "F4-target-20260729" / "target-admission.json"
    ranking = RUN / "validation-ranking.json"
    smoke = RUN / "smoke-safety.json"
    training = RUN / "training-safety.json"
    merge_provenance = merged / "stage2-merge-provenance.json"
    report = {
        "schema_version": 1,
        "decision": "ACCEPT_CANDIDATE_ONLY" if strict else "REJECT_NO_STAGE2_CANDIDATE_QUALIFIED",
        "production_selected_model": None,
        "selected_production_marker_created": False,
        "production_model_changed": False,
        "render_or_upload_triggered": False,
        "target_admission": {
            "path": str(admission), "sha256": sha256(admission),
            "decision": "ACCEPTED_FOR_TARGET_REMEDIATION",
            "recording_count": 3, "canonical_sentence_count": 10,
            "all_recordings_dual_asr_and_qc_accepted": True,
        },
        "dataset": {"path": str(manifest), "sha256": sha256(manifest)},
        "training": {
            "stacked_stage1_base": "fish-speech-1.5-F4-target-r8-step40-20260729",
            "adapter": {"rank": 4, "alpha": 8, "dropout": 0.01},
            "learning_rate": 1e-5, "batch_size": 1, "workers": 1,
            "gradient_accumulation": 4, "precision": "bf16-true",
            "maximum_steps": 20, "checkpoint_and_validation_interval": 5,
            "fresh_optimizer": True, "resume_after_safety_stop": False,
            "smoke_evidence": {"path": str(smoke), "sha256": sha256(smoke)},
            "safety_evidence": {"path": str(training), "sha256": sha256(training)},
            "terminated_by_hard_stop": True, "hard_stop_c": 74, "observed_max_c": 75,
            "stored_steps": [5, 10], "eligible_steps": [10], "missing_planned_steps": [15, 20],
        },
        "validation_ranking": {"path": str(ranking), "sha256": sha256(ranking)},
        "fixed_probe_contract": {
            "critical_text": contract.CRITICAL_TEXT, "critical_seed": 20260729,
            "critical_tokens": contract.TOKENS,
            "heldout_text": contract.HELDOUT_TEXT, "heldout_seed": 20260730,
            "tempo": 1.0, "start_limit_c": 52, "hard_stop_c": 74,
            "poll_interval_seconds": 0.5,
        },
        "candidate": {
            "step": 10, "checkpoint": str(checkpoint), "checkpoint_sha256": sha256(checkpoint),
            "merged_path": str(merged), "merged_model_sha256": sha256(merged / "model.pth"),
            "merge_provenance": str(merge_provenance), "merge_provenance_sha256": sha256(merge_provenance),
            "candidate_only_not_production_selected": True,
            "probe_generation": str(generation_path), "probe_generation_sha256": sha256(generation_path),
            "probe_max_temperature_c": generation["max_temperature_c"],
            "asr": engines, "strict_dual_asr_pass": strict,
        },
        "required_next_action": (
            "Parent review may consider this candidate, but no production promotion was performed."
            if strict else
            "Do not promote. The sole eligible stored stage-2 candidate failed strict dual-ASR qualification."
        ),
    }
    output = RUN / "stage2-checkpoint-comparison.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output), "decision": report["decision"], "strict_dual_asr_pass": strict,
        "engines": {name: {
            "critical_exact": row["critical_full_text_exact"],
            "heldout_exact": row["heldout_full_text_exact"],
            "all_tokens_exact": all(row["critical_tokens"].values()),
        } for name, row in engines.items()},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
