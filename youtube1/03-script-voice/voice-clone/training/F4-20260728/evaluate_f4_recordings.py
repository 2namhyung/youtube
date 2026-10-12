"""Produce a deterministic admission report for the immutable F4 recordings.

This script performs recording QC and verifies the already-produced dual-ASR
transcripts against the fixed F4 scripts.  It deliberately does not build a
Fish Speech dataset or invoke training.  The held-out validation recording is
read only from validation-lock and is never exposed as a train/reference input.
"""

from __future__ import annotations

import hashlib
import json
import os
import math
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
RUN_DIR = WORKSPACE / "03-script-voice" / "runs" / "F4-20260728"

ORIGINALS = {
    "train": Path(os.environ["OWNER_TRAIN_RECORDING"]),
    "validation": Path(os.environ["OWNER_VALIDATION_RECORDING"]),
}
PCM = {
    "train": ROOT / "train-work" / "F4_train.full.wav",
    "validation": ROOT / "validation-lock" / "F4_validation.full.wav",
}

EXPECTED = {
    "train": [
        "교권보호국이라는 설정은 허구지만, 현실의 교권 보호 제도는 제대로 작동하고 있을까요?",
        "지난 4월 제주에서 열여섯 살 고등학생이 초등학교 교실에 침입했습니다.",
        "다음 날 여교사가 매일 쓰던 텀블러에서 수상한 액체를 발견했다고 밝혔습니다.",
        "교사용 의자에 소변을 봤습니다. 신고를 받은 경찰은 현장에 남은 흔적을 확인했습니다.",
        "경찰은 건조물침입과 재물손괴 혐의를 적용해 사건 경위를 조사했습니다.",
        "피해 교사 측은 휴대전화와 컴퓨터 포렌식 영장을 요청했지만, 법원은 기각했습니다.",
        "피의자는 혐의를 인정하면서도 교사를 노린 것은 아니라고 진술했습니다. 경찰은 추가 조사를 이어가고 있습니다.",
        "범인이 붙잡힌 뒤에도 피해자는 불안에서 벗어나지 못했습니다. 학교의 출입 관리와 피해자 보호가 정말 필요하지 않을까요?",
    ],
    "validation": [
        "검찰은 건조물침입과 재물손괴 혐의를 따로 검토했고, 디지털 포렌식 결과도 함께 살폈습니다.",
        "지난 6월 제주 한 학교에서 비슷한 신고가 접수됐습니다. 반복을 막으려면 어떤 보호 장치가 필요할까요?",
    ],
}

# Each tuple contains inclusive ASR segment indices for one fixed script item.
GROUPS = {
    "train": [(0,), (1,), (2,), (3, 4), (5,), (6,), (7, 8), (9, 10)],
    "validation": [(0,), (1, 2)],
}
TURBO_VALIDATION_GROUPS = [(0, 1), (2, 3)]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def normalized(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return "".join(char for char in text if char.isalnum())


def audio_qc(path: Path) -> dict:
    audio, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    mono = audio.mean(axis=1)
    abs_audio = np.abs(mono)
    peak = float(abs_audio.max(initial=0.0))
    rms = float(np.sqrt(np.mean(np.square(mono), dtype=np.float64)))
    frame_length = max(1, int(sample_rate * 0.05))
    trimmed = mono[: len(mono) - (len(mono) % frame_length)]
    frames = trimmed.reshape(-1, frame_length)
    frame_rms = np.sqrt(np.mean(np.square(frames), axis=1, dtype=np.float64))
    nonzero = frame_rms[frame_rms > 1e-9]
    noise_estimate = float(np.percentile(nonzero, 10)) if len(nonzero) else 0.0
    silence_threshold = 10 ** (-42 / 20)
    return {
        "path": str(path),
        "sha256": sha256(path),
        "duration_seconds": round(len(mono) / sample_rate, 6),
        "sample_rate": sample_rate,
        "channels": audio.shape[1],
        "subtype": sf.info(path).subtype,
        "peak_dbfs": round(20 * math.log10(max(peak, 1e-12)), 3),
        "rms_dbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
        "clipped_samples": int(np.count_nonzero(abs_audio >= 0.999969)),
        "digital_zero_ratio": round(float(np.mean(abs_audio == 0)), 6),
        "quiet_window_p10_dbfs": round(
            20 * math.log10(max(noise_estimate, 1e-12)), 3
        ),
        "frames_below_minus_42_db_ratio": round(
            float(np.mean(frame_rms < silence_threshold)), 6
        ),
    }


def load_asr(engine: str, split: str) -> dict:
    path = ROOT / f"asr-{engine}" / split / f"F4_{split}.full.asr.json"
    return json.loads(path.read_text(encoding="utf-8"))


def grouped_asr(engine: str, split: str) -> list[dict]:
    asr = load_asr(engine, split)
    groups = (
        TURBO_VALIDATION_GROUPS
        if engine == "turbo" and split == "validation"
        else GROUPS[split]
    )
    output = []
    for indices in groups:
        segments = [asr["segments"][index] for index in indices]
        output.append(
            {
                "start": min(item["start"] for item in segments),
                "end": max(item["end"] for item in segments),
                "text": " ".join(item["text"] for item in segments),
                "segment_ids": [item["id"] for item in segments],
            }
        )
    return output


def alignment(split: str) -> list[dict]:
    primary = grouped_asr("primary", split)
    turbo = grouped_asr("turbo", split)
    rows = []
    for index, expected in enumerate(EXPECTED[split]):
        p = primary[index]
        t = turbo[index]
        row = {
            "item": index + 1,
            "expected": expected,
            "time_range_seconds": [
                round(min(p["start"], t["start"]), 2),
                round(max(p["end"], t["end"]), 2),
            ],
            "primary": p,
            "turbo": t,
            "primary_exact_normalized": normalized(p["text"]) == normalized(expected),
            "turbo_exact_normalized": normalized(t["text"]) == normalized(expected),
        }
        row["dual_exact_normalized"] = (
            row["primary_exact_normalized"] and row["turbo_exact_normalized"]
        )
        rows.append(row)
    return rows


def main() -> None:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    train_alignment = alignment("train")
    validation_alignment = alignment("validation")
    report = {
        "schema_version": 1,
        "decision": "rejected-before-dataset",
        "accepted_for_training": False,
        "reason": "fixed training script failed strict dual-ASR and restart checks",
        "original_sources": {
            split: {
                "path": str(path),
                "sha256": sha256(path),
                "bytes": path.stat().st_size,
            }
            for split, path in ORIGINALS.items()
        },
        "pcm_qc": {split: audio_qc(path) for split, path in PCM.items()},
        "ffmpeg_loudness_evidence": {
            "train": {"integrated_lufs": -29.4, "lra_lu": 8.0, "true_peak_dbfs": -5.7},
            "validation": {"integrated_lufs": -28.7, "lra_lu": 4.1, "true_peak_dbfs": -9.1},
        },
        "dual_asr": {
            "primary": "faster-whisper-large-v3, CUDA float16, beam=5",
            "consensus": "faster-whisper-large-v3-turbo, CUDA float16, beam=5",
            "normalization": "NFKC; punctuation and whitespace removed; no transcript correction",
            "train": train_alignment,
            "validation": validation_alignment,
            "train_items_dual_exact": sum(
                row["dual_exact_normalized"] for row in train_alignment
            ),
            "validation_items_dual_exact": sum(
                row["dual_exact_normalized"] for row in validation_alignment
            ),
        },
        "asr_display_normalization_note": {
            "item": 2,
            "range_seconds": [7.86, 13.00],
            "fixed_script": "열여섯 살",
            "both_asr_display": "16살",
            "disposition": "semantic numeral rendering only; retain the fixed written transcript and do not use ASR text as a label",
        },
        "blocking_findings": [
            {
                "id": "train-04-bwat",
                "range_seconds": [22.52, 24.30],
                "expected": "교사용 의자에 소변을 봤습니다.",
                "primary": "교사용 의자에 소변을 받습니다.",
                "turbo": "교사용 의자에 소변을 받습니다.",
                "classification": "dual-ASR lexical misread",
            },
            {
                "id": "train-05-son-goe",
                "range_seconds": [31.41, 36.89],
                "expected": "재물손괴",
                "primary": "재물손기",
                "turbo": "재물손괴",
                "classification": "dual-ASR disagreement",
            },
            {
                "id": "train-06-restart",
                "range_seconds": [36.67, 45.14],
                "evidence": "both models timestamp `피해` at 36.67-37.57, followed by about 2.5 seconds before `교사 측은` resumes",
                "classification": "spoken false start/restart; not a continuous natural sentence",
            },
            {
                "id": "train-08-buran-eseo",
                "range_seconds": [59.30, 62.68],
                "expected": "불안에서",
                "primary": "불안해서",
                "turbo": "불안에서",
                "classification": "dual-ASR disagreement",
            },
        ],
        "reusable_clean_segment_plan": [
            {"item": 1, "range_seconds": [1.13, 6.79], "script": EXPECTED["train"][0]},
            {
                "item": 2,
                "range_seconds": [7.86, 13.00],
                "script": EXPECTED["train"][1],
                "note": "ASR displays the spoken Korean numeral as 16; label must remain the fixed script",
            },
            {"item": 3, "range_seconds": [15.09, 19.77], "script": EXPECTED["train"][2]},
            {"item": 7, "range_seconds": [48.53, 55.85], "script": EXPECTED["train"][6]},
        ],
        "rerecord_required": [
            {
                "item": 4,
                "original_range_seconds": [22.52, 28.71],
                "script": EXPECTED["train"][3],
                "reason": "both models heard 받습니다; rerecord the whole two-sentence unit",
            },
            {
                "item": 5,
                "original_range_seconds": [31.41, 36.89],
                "script": EXPECTED["train"][4],
                "reason": "primary model heard 재물손기",
            },
            {
                "item": 6,
                "original_range_seconds": [36.67, 45.14],
                "script": EXPECTED["train"][5],
                "reason": "false start/restart; rerecord as one uninterrupted sentence",
            },
            {
                "item": 8,
                "original_range_seconds": [59.30, 66.79],
                "script": EXPECTED["train"][7],
                "reason": "primary model heard 불안해서; rerecord the whole two-sentence unit",
            },
        ],
        "validation_isolation": {
            "status": "hash-locked-and-excluded",
            "source_sha256": sha256(ORIGINALS["validation"]),
            "pcm_sha256": sha256(PCM["validation"]),
            "storage": str(PCM["validation"]),
            "used_in_training": False,
            "used_as_reference_prompt": False,
            "used_in_augmentation": False,
            "dual_asr_passed": all(
                row["dual_exact_normalized"] for row in validation_alignment
            ),
        },
        "artifacts_not_created": [
            "Fish Speech F4 dataset",
            "F4 train/validation protos",
            "F4 smoke checkpoint",
            "F4 bounded-train checkpoint",
            "F4 merged model",
            "F4 synthesized target-token comparisons",
        ],
    }
    output = RUN_DIR / "recording-admission-rejection.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
