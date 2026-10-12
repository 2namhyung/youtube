"""Build the immutable F4 checkpoint-selection evidence summary.

This evaluator is read-only apart from its single JSON report. It intentionally
does not run synthesis or ASR. Base/F3 probes were not rerun after the F4 safety
stop and strict-gate failure.
"""

from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
RUN = WORKSPACE / "03-script-voice" / "runs" / "F4-20260729"
RESULTS = Path(r"C:\Users\User\tools\fish-speech\results\F4_salvage_20260729_r8")
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
CRITICAL_TOKENS = [
    "교권보호국", "제주", "제조", "텀블러", "봤습니다", "받았습니다",
    "밟았습니다", "바꿨습니다", "건조물침입", "재물손괴", "포렌식",
]


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return "".join(re.findall(r"[0-9A-Za-z가-힣]+", text)).lower()


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def read_asr(profile: str, engine: str, probe: str) -> str:
    path = RUN / "probes" / profile / f"asr-{engine}" / f"{probe}.asr.json"
    payload = json.loads(path.read_text(encoding="utf-8"))
    return " ".join(segment["text"].strip() for segment in payload["segments"])


def evaluate_profile(profile: str, step: int) -> dict:
    folder = RUN / "probes" / profile
    generation = json.loads((folder / "generation.json").read_text(encoding="utf-8"))
    engines = {}
    for engine in ("primary", "turbo"):
        critical = read_asr(profile, engine, "critical")
        heldout = read_asr(profile, engine, "heldout")
        token_results = {
            token: normalize(token) in normalize(critical) for token in CRITICAL_TOKENS
        }
        engines[engine] = {
            "critical_transcript": critical,
            "critical_full_text_exact": normalize(critical) == normalize(CRITICAL_TEXT),
            "critical_tokens": token_results,
            "heldout_transcript": heldout,
            "heldout_full_text_exact": normalize(heldout) == normalize(HELDOUT_TEXT),
        }
    checkpoint = RESULTS / "checkpoints" / f"step_{step:09d}.ckpt"
    merged = CHECKPOINTS / f"fish-speech-1.5-F4-salvage-r8-step{step}-20260729" / "model.pth"
    strict_pass = all(
        item["critical_full_text_exact"]
        and item["heldout_full_text_exact"]
        and all(item["critical_tokens"].values())
        for item in engines.values()
    )
    return {
        "profile": profile,
        "step": step,
        "checkpoint_path": str(checkpoint),
        "checkpoint_sha256": sha256(checkpoint),
        "candidate_merged_model_path": str(merged),
        "candidate_merged_model_sha256": sha256(merged),
        "reference_audio_sha256": generation["reference_audio_sha256"],
        "prompt_text": generation["prompt_text"],
        "tempo": generation["tempo"],
        "max_probe_temperature_c": generation["max_temperature_c"],
        "audio": {
            request["id"]: {
                "sha256": request["audio_sha256"],
                "duration_seconds": request["duration_seconds"],
            }
            for request in generation["requests"]
        },
        "asr": engines,
        "strict_dual_asr_pass": strict_pass,
    }


def main() -> None:
    profiles = [evaluate_profile("f4-step60", 60), evaluate_profile("f4-step40", 40)]
    report = {
        "schema_version": 1,
        "decision": "REJECT_NO_F4_MODEL_SELECTED",
        "selection_gate": (
            "Both large-v3 and large-v3-turbo must match normalized full critical and "
            "held-out text, and every critical token must be present."
        ),
        "fixed_probe": {
            "critical_text": CRITICAL_TEXT,
            "critical_seed": 20260729,
            "critical_tokens": CRITICAL_TOKENS,
            "heldout_text": HELDOUT_TEXT,
            "heldout_seed": 20260730,
            "reference_audio": str(
                WORKSPACE / "03-script-voice" / "voice-clone" / "samples" / "F3-prosody-prompt.wav"
            ),
            "tempo": 1.0,
        },
        "training": {
            "result_dir": str(RESULTS),
            "configuration": {
                "lora_rank": 8,
                "lora_alpha": 16,
                "batch_size": 1,
                "workers": 1,
                "gradient_accumulation": 4,
                "precision": "bf16-mixed",
                "learning_rate": 0.00005,
                "checkpoint_interval_steps": 20,
            },
            "safety_stop": {
                "observed_logged_step": 114,
                "temperature_c": 83,
                "hard_limit_c": 82,
                "action": "training process terminated immediately",
                "step_120_checkpoint_present": True,
                "step_120_excluded": True,
                "reason": "created during the stop race and explicitly barred from selection",
            },
            "validation_ranking": [
                {"step": 60, "loss": 8.375, "top_5_accuracy": 0.369141, "rank": 1},
                {"step": 40, "loss": 8.375, "top_5_accuracy": 0.367188, "rank": 2},
                {"step": 20, "loss": 8.4375, "top_5_accuracy": 0.361328, "rank": 3},
                {"step": 80, "loss": 8.5, "top_5_accuracy": 0.367188, "rank": 4},
                {"step": 100, "loss": 8.875, "top_5_accuracy": 0.357422, "rank": 5},
            ],
            "allowed_probe_steps": [60, 40],
        },
        "profiles": profiles,
        "baseline_comparison": {
            "base": "NOT_RERUN_AFTER_SAFETY_FINALIZATION",
            "f3": "NOT_RERUN_AFTER_SAFETY_FINALIZATION",
            "reason": (
                "F4 candidates already failed the non-negotiable dual-ASR gate; parent "
                "direction prohibited further high-load inference after the 83 C stop."
            ),
            "partial_base_probe_artifacts": str(RUN / "probes" / "base"),
            "partial_base_probe_is_evidence": False,
        },
        "evidence_scope_notes": {
            "whole_file_admission_report": (
                "new-recordings-admission-rejection.json is an admission-time snapshot; "
                "its artifacts_not_created field applies to whole-file admission only"
            ),
            "subsequent_sentence_salvage": (
                "sentence-salvage.json admitted 25 sentence clips/125.0 s and enabled "
                "the bounded experiment documented here"
            ),
        },
        "selected_model": None,
        "production_model_changed": False,
        "candidate_merges_are_not_selected_models": True,
        "next_recordings": [
            "교권보호국은 현실의 학교를 안전하게 지킬 수 있을까요?",
            "교사는 의자에 남은 흔적을 직접 봤습니다.",
            "경찰은 건조물침입과 재물손괴 혐의를 함께 검토했습니다.",
        ],
    }
    output = RUN / "checkpoint-comparison.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output),
        "decision": report["decision"],
        "profiles": {item["profile"]: item["strict_dual_asr_pass"] for item in profiles},
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
