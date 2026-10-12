"""Admission-only QC for the second F4 recording delivery.

The evaluator compares two cached Whisper transcripts to the independent fixed
section scripts. It does not create a Fish Speech dataset or training inputs.
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
RUN_DIR = WORKSPACE / "03-script-voice" / "runs" / "F4-20260729"
SOURCE_DIR = Path(os.environ["OWNER_RECORDING_DIR"])

SOURCES = {
    **{f"extra_{i:02d}": SOURCE_DIR / f"F4_extra_{i:02d}.m4a.m4a" for i in range(1, 8)},
    "recording_08": SOURCE_DIR / "녹음 (8).m4a",
}

CANONICAL = {
    "section_01": "이 원고의 모든 상황은 음성 학습을 위한 허구의 예시이며, 등장하는 인물과 장소는 실제와 무관한 익명의 존재하지 않는 곳입니다. 가상의 마을 새솔리에서는 2026년 7월 18일 오전 8시 40분, 작은 배움터의 문이 열리지 않는다는 연락이 관리실에 들어왔습니다. 출근하던 교사는 복도 바닥에 남은 흙자국을 먼저 봤습니다. 누군가 신발을 질질 끌고 들어온 듯했지만, 교실 안 물건이 모두 사라진 것은 아니었습니다. 책상 위에는 전날 놓아둔 텀블러와 안내문이 그대로 있었고, 창가의 화분만 방향이 바뀌어 있었습니다.",
    "section_02": "담당자는 현장을 보존하고 출입 기록을 받았습니다. 기록에는 오전 7시 55분부터 8시 12분까지 낯선 방문자가 머문 흔적이 남아 있었습니다. 교사는 “아이들이 오기 전에 무엇을 확인해야 할까요?”라고 물었고, 안전 담당자는 “먼저 문손잡이와 주변 영상을 살펴보겠습니다”라고 답했습니다. 두 사람은 서두르지 않고 사진을 찍었으며, 훼손된 안내판의 수리비가 삼십이만 원 정도라는 설명도 덧붙였습니다.",
    "section_03": "새솔리 주민센터의 가상 교권보호국은 교사의 권한을 빼앗는 기관이 아니라, 수업과 안전을 지키도록 돕는 창구로 소개됐습니다. 담당 직원은 교권과 권한을 혼동하면 안 된다고 말했습니다. 교사는 학생을 통제하는 사람이 아니라 배울 권리를 보호하는 사람이며, 보호국은 그 원칙을 확인하는 곳이라는 설명입니다. 발표를 듣던 주민 한 명이 “그렇다면 신고 뒤 교사는 누구에게 도움을 받습니까?”라고 묻자, 직원은 상담 기록과 긴급 연락망을 함께 받았다고 답했습니다.",
    "section_04": "조사팀은 복도에서 신발 자국을 봤습니다. 보관함 옆에는 누군가 놓고 간 상자를 받았습니다. 급히 이동하던 사람이 경고선을 밟았습니다. 그래서 팀은 동선을 다시 표시하고 표지판의 위치를 바꿨습니다. 이 네 장면은 비슷하게 들리지만 뜻이 다릅니다. 봤습니다는 눈으로 확인했다는 뜻이고, 받았습니다는 물건이나 도움을 건넸다는 뜻이며, 밟았습니다는 발로 눌렀다는 뜻입니다. 바꿨습니다는 위치나 상태를 새롭게 조정했다는 의미입니다. 문장 끝의 습니다 소리는 약하게 흘리지 말고, 앞 음절과 자연스럽게 이어 읽어야 합니다.",
    "section_05": "가상 수사관은 사건의 법적 이름을 서둘러 단정하지 않았습니다. 건조물침입 가능성과 재물손괴 가능성을 각각 기록하고, 피의자와 피해자의 진술을 따로 들었습니다. 피해자는 텀블러의 뚜껑이 열려 있었고 내용물이 조금 줄었다고 말했지만, 피의자는 복도에 들어간 사실만 인정했습니다. 수사관은 휴대전화 포렌식 자료와 출입문 영상을 확인한 뒤 필요한 영장을 신청할지 검토했습니다. 영장이 발부되면 자료를 보존하고, 기각되면 다른 합법적인 확인 방법을 찾기로 했습니다.",
    "section_06": "기록에는 제주에서 가져온 감귤 상자와 제주에서 만든 제품이라는 표시가 함께 있었습니다. 담당자는 지명인 제주와 물건을 만든다는 뜻의 제조를 혼동하지 않도록 문장을 다시 읽었습니다. “제주에서 제조한 부품”이라는 표현은 장소와 생산 행위를 한 문장에 담지만, 두 낱말의 소리와 뜻은 다릅니다. 숫자도 정확해야 합니다. 7월 18일 오후 3시, 보관 비용은 하루 1만 2천 원, 교체 견적은 32만 원이라고 천천히 확인했습니다.",
    "section_07": "처음에는 단순한 장난으로 보였습니다. 그러나 작은 흔적을 넘기면 다음 신고를 막기 어렵습니다. 조사팀은 문 앞 조명을 밝히고, 교사가 혼자 대응하지 않도록 당직표를 바꿨습니다. 주민센터는 상담 창구를 오후 6시까지 열고, 익명 제보도 받았습니다. 한 달 뒤에는 같은 장소에서 모의 대피를 진행했습니다. 누군가 “이제 안전하다고 말할 수 있을까요?”라고 묻자 담당자는 “완벽하다고 단정할 수는 없지만, 확인하고 기록하며 고치는 절차가 생겼습니다”라고 답했습니다. 문제를 숨기는 것보다 사실을 차분히 말하고, 피해자의 일상과 교사의 수업을 함께 지키는 해법을 찾는 일이 중요합니다.",
}

MAPPING = {
    "extra_01": "section_01",
    "extra_02": "section_02",
    "extra_04": "section_03",
    "extra_05": "section_04",
    "extra_06": "section_05",
    "recording_08": "section_06",
    "extra_07": "section_07",
}

LOUDNESS = {
    "extra_01": (-31.2, 3.0, -9.6),
    "extra_02": (-29.6, 3.1, -8.0),
    "extra_03": (-26.2, 4.0, -4.1),
    "extra_04": (-29.3, 2.9, -8.0),
    "extra_05": (-28.7, 2.7, -7.3),
    "extra_06": (-29.1, 3.8, -6.9),
    "extra_07": (-28.3, 3.6, -6.8),
    "recording_08": (-28.2, 2.3, -7.5),
}

SILENCE_RANGES = {
    "extra_01": (0.347, 1.128),
    "extra_02": (0.454, 1.476),
    "extra_03": (0.256, 1.045),
    "extra_04": (0.276, 1.366),
    "extra_05": (0.353, 1.348),
    "extra_06": (0.425, 1.782),
    "extra_07": (0.337, 1.062),
    "recording_08": (0.277, 1.045),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def normalized(text: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFKC", text) if char.isalnum()
    )


def transcript(engine: str, recording: str) -> tuple[str, list[dict]]:
    path = ROOT / f"asr-{engine}" / f"{recording}.full.asr.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    return " ".join(item["text"] for item in data["segments"]), data["segments"]


def audio_qc(recording: str) -> dict:
    path = ROOT / "admission-work" / f"{recording}.full.wav"
    audio, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    mono = audio.mean(axis=1)
    absolute = np.abs(mono)
    peak = float(absolute.max(initial=0.0))
    rms = float(np.sqrt(np.mean(np.square(mono), dtype=np.float64)))
    frame_len = int(sample_rate * 0.05)
    frames = mono[: len(mono) - len(mono) % frame_len].reshape(-1, frame_len)
    frame_rms = np.sqrt(np.mean(np.square(frames), axis=1, dtype=np.float64))
    nonzero = frame_rms[frame_rms > 1e-9]
    quiet = float(np.percentile(nonzero, 10)) if len(nonzero) else 0.0
    lufs, lra, true_peak = LOUDNESS[recording]
    silence_min, silence_max = SILENCE_RANGES[recording]
    return {
        "pcm_path": str(path),
        "pcm_sha256": sha256(path),
        "duration_seconds": round(len(mono) / sample_rate, 6),
        "sample_rate": sample_rate,
        "channels": audio.shape[1],
        "subtype": sf.info(path).subtype,
        "integrated_lufs": lufs,
        "lra_lu": lra,
        "true_peak_dbfs": true_peak,
        "sample_peak_dbfs": round(20 * math.log10(max(peak, 1e-12)), 3),
        "rms_dbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
        "quiet_50ms_window_p10_dbfs": round(
            20 * math.log10(max(quiet, 1e-12)), 3
        ),
        "clipped_samples": int(np.count_nonzero(absolute >= 0.999969)),
        "digital_zero_ratio": round(float(np.mean(absolute == 0)), 6),
        "silence_threshold_dbfs": -42,
        "detected_silence_min_seconds": silence_min,
        "detected_silence_max_seconds": silence_max,
    }


def main() -> None:
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    recordings = {}
    for recording, source in SOURCES.items():
        primary, primary_segments = transcript("primary", recording)
        turbo, turbo_segments = transcript("turbo", recording)
        section = MAPPING.get(recording)
        expected = CANONICAL.get(section) if section else None
        recordings[recording] = {
            "source": str(source),
            "source_sha256": sha256(source),
            "source_bytes": source.stat().st_size,
            "qc": audio_qc(recording),
            "mapped_section": section,
            "expected": expected,
            "primary": primary,
            "turbo": turbo,
            "primary_exact_normalized": (
                normalized(primary) == normalized(expected) if expected else False
            ),
            "turbo_exact_normalized": (
                normalized(turbo) == normalized(expected) if expected else False
            ),
            "asr_agreement": normalized(primary) == normalized(turbo),
            "primary_segments": primary_segments,
            "turbo_segments": turbo_segments,
        }

    report = {
        "schema_version": 1,
        "decision": "rejected-before-dataset",
        "accepted_for_training": False,
        "reason": "required replacement audio is absent and every mapped section has at least one strict transcript failure",
        "section_mapping": {
            **{section: recording for recording, section in MAPPING.items()},
            "unmapped_recording": "extra_03",
        },
        "recording_08_identification": {
            "mapped_section": "section_06",
            "content_role": "제주/제조 and numeric-reading contrast",
            "contains_replacement_items_4_5_6_8": False,
        },
        "recordings": recordings,
        "blocking_findings": [
            {"recording": "extra_01", "range_seconds": [4.71, 9.55], "expected": "익명의 존재하지 않는 곳입니다", "primary": "익명에 존재하지 않은 곳입니다", "turbo": "익명에 존재하지 않은 곳입니다"},
            {"recording": "extra_01", "range_seconds": [10.59, 15.45], "expected": "새솔리", "primary": "세솔리", "turbo": "새솔리"},
            {"recording": "extra_01", "range_seconds": [29.60, 32.30], "expected": "교실 안 물건", "primary": "교실한 물건", "turbo": "교실한 물건"},
            {"recording": "extra_02", "range_seconds": [25.11, 29.77], "expected": "안내판의 수리비", "primary": "안내판에 수리비", "turbo": "안내판에 수리비"},
            {"recording": "extra_04", "range_seconds": [0.78, 9.22], "expected": "새솔리 ... 기관이 아니라", "primary": "세솔리 ... 기간이 아니라", "turbo": "세솔리 ... 기간이 아니라"},
            {"recording": "extra_05", "range_seconds": [13.22, 17.34], "expected": "동선을 다시 표시", "primary": "동선은 다시 표시", "turbo": "동선은 다시 표시"},
            {"recording": "extra_05", "range_seconds": [22.10, 24.94], "expected": "봤습니다는", "primary": "봤습니다는", "turbo": "받습니다는"},
            {"recording": "extra_05", "range_seconds": [32.90, 36.54], "expected": "새롭게 조정했다", "primary": "새롭게 조성했다", "turbo": "새롭게 조성했다"},
            {"recording": "extra_05", "range_seconds": [36.38, 44.72], "expected": "문장 끝의 ... 자연스럽게 이어 읽어야", "primary": "문장 끝에 ... 자연스럽게 읽어야", "turbo": "문장 끝에 ... 자연스럽게 읽어야"},
            {"recording": "extra_06", "range_seconds": [5.58, 12.78], "expected": "재물손괴", "primary": "재물 송계", "turbo": "재물손괴"},
            {"recording": "recording_08", "range_seconds": [7.58, 14.06], "expected": "뜻의 제조", "primary": "뜻의 제조", "turbo": "뜻에 제주"},
            {"recording": "recording_08", "range_seconds": [15.13, 23.56], "expected": "제조한 부품", "primary": "제조한 제품", "turbo": "제조한 부품"},
            {"recording": "extra_07", "range_seconds": [25.24, 36.25], "expected": "완벽하다고 단정할 수는 없지만, 확인하고 기록하며", "primary": "완벽하다고는 단정할 수는 없지만, 확인하고 기록하며", "turbo": "완벽하다고는 단정할 수는 없지만, 확인하고 기록하면"},
            {"recording": "extra_03", "range_seconds": [0.87, 59.34], "expected": "one of canonical section_01..07", "primary": "unmapped production-script take", "turbo": "unmapped production-script take"},
        ],
        "missing_required_replacements": [
            "교사용 의자에 소변을 봤습니다. 신고를 받은 경찰은 현장에 남은 흔적을 확인했습니다.",
            "경찰은 건조물침입과 재물손괴 혐의를 적용해 사건 경위를 조사했습니다.",
            "피해 교사 측은 휴대전화와 컴퓨터 포렌식 영장을 요청했지만, 법원은 기각했습니다.",
            "범인이 붙잡힌 뒤에도 피해자는 불안에서 벗어나지 못했습니다. 학교의 출입 관리와 피해자 보호가 정말 필요하지 않을까요?",
        ],
        "validation_isolation": {
            "original_path": str(SOURCE_DIR / "F4_validation.wav.m4a"),
            "original_sha256": sha256(SOURCE_DIR / "F4_validation.wav.m4a"),
            "expected_sha256": "180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8",
            "pcm_path": str(WORKSPACE / "03-script-voice/voice-clone/training/F4-20260728/validation-lock/F4_validation.full.wav"),
            "pcm_sha256": sha256(WORKSPACE / "03-script-voice/voice-clone/training/F4-20260728/validation-lock/F4_validation.full.wav"),
            "used_in_training": False,
            "used_as_reference_prompt": False,
            "used_in_augmentation": False,
        },
        "artifacts_not_created": [
            "F4 Fish Speech dataset",
            "F4 VQ tokens or protos",
            "F4 smoke or bounded training run",
            "F4 checkpoint or merged model",
            "base/F3/F4 synthesis comparison",
        ],
    }
    output = RUN_DIR / "new-recordings-admission-rejection.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(output)


if __name__ == "__main__":
    main()
