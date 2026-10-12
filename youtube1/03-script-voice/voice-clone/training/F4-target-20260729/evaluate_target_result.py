"""Build final machine-readable evidence for F4 target remediation."""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
RUN = WORKSPACE / "03-script-voice" / "runs" / "F4-target-20260729"
RESULT = Path(r"C:\Users\User\tools\fish-speech\results\F4_target_remediation_20260729_base_r8")
CHECKPOINTS = Path(r"C:\Users\User\tools\fish-speech\checkpoints")
CRITICAL_TEXT = (
    "교권보호국은 제주에서 제조한 텀블러를 봤습니다. 상자를 받았습니다. "
    "경고선을 밟았습니다. 안내판 위치를 바꿨습니다. 경찰은 건조물침입과 "
    "재물손괴 가능성을 기록하고 휴대전화 포렌식 자료를 확인했습니다."
)
HELDOUT_TEXT = (
    "검찰은 건조물침입과 재물손괴 혐의를 따로 검토했고, 디지털 포렌식 결과도 "
    "함께 살폈습니다. 지난 6월 제주 한 학교에서 비슷한 신고가 접수됐습니다. "
    "반복을 막으려면 어떤 보호 장치가 필요할까요?"
)
TOKENS = [
    "교권보호국", "제주", "제조", "텀블러", "봤습니다", "받았습니다",
    "밟았습니다", "바꿨습니다", "건조물침입", "재물손괴", "포렌식",
]


def normalize(text: str) -> str:
    return "".join(re.findall(r"[0-9A-Za-z가-힣]+", unicodedata.normalize("NFKC", text))).lower()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def asr(profile: str, engine: str, probe: str) -> str:
    payload = json.loads((RUN / "probes" / profile / f"asr-{engine}" / f"{probe}.asr.json").read_text(encoding="utf-8"))
    return " ".join(segment["text"].strip() for segment in payload["segments"])


def profile(step: int) -> dict:
    name = f"f4-target-step{step}"
    folder = RUN / "probes" / name
    generation = json.loads((folder / "generation.json").read_text(encoding="utf-8"))
    engines = {}
    for engine in ("primary", "turbo"):
        critical, heldout = asr(name, engine, "critical"), asr(name, engine, "heldout")
        engines[engine] = {
            "critical_transcript": critical,
            "critical_full_text_exact": normalize(critical) == normalize(CRITICAL_TEXT),
            "critical_tokens": {token: normalize(token) in normalize(critical) for token in TOKENS},
            "heldout_transcript": heldout,
            "heldout_full_text_exact": normalize(heldout) == normalize(HELDOUT_TEXT),
        }
    strict = all(
        row["critical_full_text_exact"] and row["heldout_full_text_exact"]
        and all(row["critical_tokens"].values()) for row in engines.values()
    )
    ckpt = RESULT / "checkpoints" / f"step_{step:09d}.ckpt"
    merged = CHECKPOINTS / f"fish-speech-1.5-F4-target-r8-step{step}-20260729" / "model.pth"
    return {
        "profile": name, "step": step,
        "checkpoint_path": str(ckpt), "checkpoint_sha256": sha256(ckpt),
        "candidate_merged_model_path": str(merged), "candidate_merged_model_sha256": sha256(merged),
        "candidate_only_not_selected": True,
        "probe_start_max_temperature_c": generation["max_temperature_c"],
        "reference_audio_sha256": generation["reference_audio_sha256"],
        "prompt_text": generation["prompt_text"], "tempo": generation["tempo"],
        "audio": {row["id"]: {"sha256": row["audio_sha256"], "duration_seconds": row["duration_seconds"]} for row in generation["requests"]},
        "asr": engines, "strict_dual_asr_pass": strict,
    }


def main() -> None:
    admission = RUN / "target-admission.json"
    manifest = ROOT / "fish-dataset" / "dataset_manifest.json"
    resume_preflight = RUN / "safe-resume.json"
    training_safety = RUN / "base-training-safety.json"
    profiles = [profile(40), profile(30)]
    original_step40 = Path(r"C:\Users\User\tools\fish-speech\results\F4_salvage_20260729_r8\checkpoints\step_000000040.ckpt")
    preflight = json.loads(resume_preflight.read_text(encoding="utf-8"))
    report = {
        "schema_version": 1,
        "decision": "REJECT_NO_TARGET_MODEL_QUALIFIED",
        "selected_model": None,
        "selected_marker_created": False,
        "production_model_changed": False,
        "render_or_upload_triggered": False,
        "admission": {"path": str(admission), "sha256": sha256(admission), "decision": "ACCEPTED_FOR_TARGET_REMEDIATION"},
        "dataset": {"path": str(manifest), "sha256": sha256(manifest)},
        "continuation": {
            "preflight_path": str(resume_preflight), "preflight_sha256": sha256(resume_preflight),
            "final_verdict": "REJECTED_AFTER_RUNTIME_STRICT_RESTORE",
            "reason": "LoRA-only Lightning state_dict omits 203 frozen base-weight keys required by strict full-state restore",
            "resumed_optimizer_steps": 0, "first_resumed_logged_step": None,
            "original_step40_sha256_before": preflight["original_sha256_before"],
            "original_step40_sha256_after_final": sha256(original_step40),
            "original_step40_unchanged": sha256(original_step40) == preflight["original_sha256_before"],
            "optimizer_state_preserved_in_copy": True, "scheduler_state_preserved_in_copy": True,
            "patched_lr": 1.5e-5,
            "callback_path_metadata_removed_only": True,
        },
        "training": {
            "mode": "base-from-scratch LoRA fallback", "lora_rank": 8, "lora_alpha": 16,
            "learning_rate": 3e-5, "batch_size": 1, "workers": 1,
            "gradient_accumulation": 4, "precision": "bf16-true", "maximum_steps": 60,
            "checkpoint_and_validation_interval": 10,
            "smoke": {"steps": 2, "passed": True, "start_temperature_c": 51, "max_temperature_c": 65},
            "safety": json.loads(training_safety.read_text(encoding="utf-8")),
            "last_logged_train_step": 44,
            "last_safe_checkpoint_step": 40,
            "validation_ranking": [
                {"rank": 1, "step": 40, "event_step": 39, "loss": 8.375, "top_5_accuracy": 0.367188},
                {"rank": 2, "step": 30, "event_step": 29, "loss": 8.4375, "top_5_accuracy": 0.361328},
                {"rank": 3, "step": 20, "event_step": 19, "loss": 8.4375, "top_5_accuracy": 0.361328},
                {"rank": 4, "step": 10, "event_step": 9, "loss": 8.4375, "top_5_accuracy": 0.359375},
            ],
        },
        "fixed_probe": {
            "critical_text": CRITICAL_TEXT, "critical_seed": 20260729,
            "critical_tokens": TOKENS, "heldout_text": HELDOUT_TEXT,
            "heldout_seed": 20260730, "tempo": 1.0, "hard_stop_c": 78,
        },
        "profiles": profiles,
        "baseline_comparison": {
            "base_and_f3_new_probes": "NOT_RUN_BY_DIRECTION",
            "existing_evidence_only": True,
            "prior_f4_comparison": str(WORKSPACE / "03-script-voice" / "runs" / "F4-20260729" / "checkpoint-comparison.json"),
        },
        "required_next_action": "No promotion. Obtain additional clean target recordings or revise training strategy under a new audited run.",
    }
    output = RUN / "target-checkpoint-comparison.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output), "decision": report["decision"],
        "profiles": {row["profile"]: row["strict_dual_asr_pass"] for row in profiles},
        "original_step40_unchanged": report["continuation"]["original_step40_unchanged"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
