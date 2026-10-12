"""Build sentence-level F4 salvage candidates under strict dual-ASR gates."""

from __future__ import annotations

import hashlib
import json
import math
import shutil
import subprocess
import unicodedata
from pathlib import Path

import soundfile as sf


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
RUN_DIR = WORKSPACE / "03-script-voice" / "runs" / "F4-20260729"
CLIP_DIR = ROOT / "salvage-clips"

NEW_PCM = ROOT / "admission-work"
OLD_ROOT = WORKSPACE / "03-script-voice" / "voice-clone" / "training" / "F4-20260728"
OLD_PCM = OLD_ROOT / "train-work" / "F4_train.full.wav"

CRITICAL = [
    "교권보호국", "제주", "제조", "텀블러", "봤습니다", "받았습니다",
    "밟았습니다", "바꿨습니다", "건조물침입", "재물손괴", "포렌식",
]


def sentences(source: str, values: list[str], prefix: str) -> list[dict]:
    return [
        {"id": f"{prefix}_{index:02d}", "source": source, "text": value}
        for index, value in enumerate(values, 1)
    ]


SPECS = []
SPECS += sentences("old_train", [
    "교권보호국이라는 설정은 허구지만, 현실의 교권 보호 제도는 제대로 작동하고 있을까요?",
    "지난 4월 제주에서 열여섯 살 고등학생이 초등학교 교실에 침입했습니다.",
    "다음 날 여교사가 매일 쓰던 텀블러에서 수상한 액체를 발견했다고 밝혔습니다.",
    "피의자는 혐의를 인정하면서도 교사를 노린 것은 아니라고 진술했습니다.",
    "경찰은 추가 조사를 이어가고 있습니다.",
], "old")
SPECS += sentences("extra_01", [
    "이 원고의 모든 상황은 음성 학습을 위한 허구의 예시이며, 등장하는 인물과 장소는 실제와 무관한 익명의 존재하지 않는 곳입니다.",
    "가상의 마을 새솔리에서는 2026년 7월 18일 오전 8시 40분, 작은 배움터의 문이 열리지 않는다는 연락이 관리실에 들어왔습니다.",
    "출근하던 교사는 복도 바닥에 남은 흙자국을 먼저 봤습니다.",
    "누군가 신발을 질질 끌고 들어온 듯했지만, 교실 안 물건이 모두 사라진 것은 아니었습니다.",
    "책상 위에는 전날 놓아둔 텀블러와 안내문이 그대로 있었고, 창가의 화분만 방향이 바뀌어 있었습니다.",
], "s01")
SPECS += sentences("extra_02", [
    "담당자는 현장을 보존하고 출입 기록을 받았습니다.",
    "기록에는 오전 7시 55분부터 8시 12분까지 낯선 방문자가 머문 흔적이 남아 있었습니다.",
    "교사는 아이들이 오기 전에 무엇을 확인해야 할까요?라고 물었고, 안전 담당자는 먼저 문손잡이와 주변 영상을 살펴보겠습니다라고 답했습니다.",
    "두 사람은 서두르지 않고 사진을 찍었으며, 훼손된 안내판의 수리비가 삼십이만 원 정도라는 설명도 덧붙였습니다.",
], "s02")
SPECS += sentences("extra_04", [
    "새솔리 주민센터의 가상 교권보호국은 교사의 권한을 빼앗는 기관이 아니라, 수업과 안전을 지키도록 돕는 창구로 소개됐습니다.",
    "담당 직원은 교권과 권한을 혼동하면 안 된다고 말했습니다.",
    "교사는 학생을 통제하는 사람이 아니라 배울 권리를 보호하는 사람이며, 보호국은 그 원칙을 확인하는 곳이라는 설명입니다.",
    "발표를 듣던 주민 한 명이 그렇다면 신고 뒤 교사는 누구에게 도움을 받습니까?라고 묻자, 직원은 상담 기록과 긴급 연락망을 함께 받았다고 답했습니다.",
], "s03")
SPECS += sentences("extra_05", [
    "조사팀은 복도에서 신발 자국을 봤습니다.",
    "보관함 옆에는 누군가 놓고 간 상자를 받았습니다.",
    "급히 이동하던 사람이 경고선을 밟았습니다.",
    "그래서 팀은 동선을 다시 표시하고 표지판의 위치를 바꿨습니다.",
    "이 네 장면은 비슷하게 들리지만 뜻이 다릅니다.",
    "봤습니다는 눈으로 확인했다는 뜻이고, 받았습니다는 물건이나 도움을 건넸다는 뜻이며, 밟았습니다는 발로 눌렀다는 뜻입니다.",
    "바꿨습니다는 위치나 상태를 새롭게 조정했다는 의미입니다.",
    "문장 끝의 습니다 소리는 약하게 흘리지 말고, 앞 음절과 자연스럽게 이어 읽어야 합니다.",
], "s04")
SPECS += sentences("extra_06", [
    "가상 수사관은 사건의 법적 이름을 서둘러 단정하지 않았습니다.",
    "건조물침입 가능성과 재물손괴 가능성을 각각 기록하고, 피의자와 피해자의 진술을 따로 들었습니다.",
    "피해자는 텀블러의 뚜껑이 열려 있었고 내용물이 조금 줄었다고 말했지만, 피의자는 복도에 들어간 사실만 인정했습니다.",
    "수사관은 휴대전화 포렌식 자료와 출입문 영상을 확인한 뒤 필요한 영장을 신청할지 검토했습니다.",
    "영장이 발부되면 자료를 보존하고, 기각되면 다른 합법적인 확인 방법을 찾기로 했습니다.",
], "s05")
SPECS += sentences("recording_08", [
    "기록에는 제주에서 가져온 감귤 상자와 제주에서 만든 제품이라는 표시가 함께 있었습니다.",
    "담당자는 지명인 제주와 물건을 만든다는 뜻의 제조를 혼동하지 않도록 문장을 다시 읽었습니다.",
    "제주에서 제조한 부품이라는 표현은 장소와 생산 행위를 한 문장에 담지만, 두 낱말의 소리와 뜻은 다릅니다.",
    "숫자도 정확해야 합니다.",
    "7월 18일 오후 3시, 보관 비용은 하루 1만 2천 원, 교체 견적은 32만 원이라고 천천히 확인했습니다.",
], "s06")
SPECS += sentences("extra_07", [
    "처음에는 단순한 장난으로 보였습니다.",
    "그러나 작은 흔적을 넘기면 다음 신고를 막기 어렵습니다.",
    "조사팀은 문 앞 조명을 밝히고, 교사가 혼자 대응하지 않도록 당직표를 바꿨습니다.",
    "주민센터는 상담 창구를 오후 6시까지 열고, 익명 제보도 받았습니다.",
    "한 달 뒤에는 같은 장소에서 모의 대피를 진행했습니다.",
    "누군가 이제 안전하다고 말할 수 있을까요?라고 묻자 담당자는 완벽하다고 단정할 수는 없지만, 확인하고 기록하며 고치는 절차가 생겼습니다라고 답했습니다.",
    "문제를 숨기는 것보다 사실을 차분히 말하고, 피해자의 일상과 교사의 수업을 함께 지키는 해법을 찾는 일이 중요합니다.",
], "s07")


def normalized(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFKC", text) if ch.isalnum()
    )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def paths(source: str, engine: str) -> tuple[Path, Path]:
    if source == "old_train":
        return OLD_PCM, OLD_ROOT / f"asr-{engine}" / "train" / "F4_train.full.asr.json"
    return (
        NEW_PCM / f"{source}.full.wav",
        ROOT / f"asr-{engine}" / f"{source}.full.asr.json",
    )


def flatten_words(asr_path: Path) -> list[dict]:
    data = json.loads(asr_path.read_text(encoding="utf-8"))
    words = []
    for segment in data["segments"]:
        for word in segment.get("words") or []:
            token = normalized(word["word"])
            if token:
                words.append({
                    "start": word["start"], "end": word["end"],
                    "text": word["word"].strip(), "normalized": token,
                    "probability": word["probability"],
                })
    return words


def exact_span(words: list[dict], expected: str) -> dict | None:
    target = normalized(expected)
    for first in range(len(words)):
        combined = ""
        for last in range(first, len(words)):
            combined += words[last]["normalized"]
            if combined == target:
                selected = words[first:last + 1]
                gaps = [
                    selected[i + 1]["start"] - selected[i]["end"]
                    for i in range(len(selected) - 1)
                ]
                return {
                    "first": first, "last": last,
                    "start": selected[0]["start"], "end": selected[-1]["end"],
                    "max_internal_gap": max(gaps, default=0.0),
                    "mean_probability": sum(w["probability"] for w in selected) / len(selected),
                    "min_probability": min(w["probability"] for w in selected),
                }
            if len(combined) >= len(target):
                break
    return None


def evaluate(spec: dict) -> dict:
    source = spec["source"]
    wav, primary_path = paths(source, "primary")
    _, turbo_path = paths(source, "turbo")
    primary_words = flatten_words(primary_path)
    turbo_words = flatten_words(turbo_path)
    primary = exact_span(primary_words, spec["text"])
    turbo = exact_span(turbo_words, spec["text"])
    row = {**spec, "audio_source": str(wav), "primary_span": primary, "turbo_span": turbo}
    reasons = []
    if not primary:
        reasons.append("primary ASR full-sentence exact match failed")
    if not turbo:
        reasons.append("turbo ASR full-sentence exact match failed")
    if primary and primary["max_internal_gap"] > 1.25:
        reasons.append("primary ASR detected long internal pause")
    if turbo and turbo["max_internal_gap"] > 1.25:
        reasons.append("turbo ASR detected long internal pause")
    if primary and turbo:
        start = min(primary["start"], turbo["start"])
        end = max(primary["end"], turbo["end"])
        for engine, words, span in (
            ("primary", primary_words, primary), ("turbo", turbo_words, turbo)
        ):
            before_gap = (
                start - words[span["first"] - 1]["end"]
                if span["first"] > 0 else math.inf
            )
            after_gap = (
                words[span["last"] + 1]["start"] - end
                if span["last"] + 1 < len(words) else math.inf
            )
            if before_gap < 0.15:
                reasons.append(f"{engine} lacks 150ms leading boundary guard")
            if after_gap < 0.15:
                reasons.append(f"{engine} lacks 150ms trailing boundary guard")
        row["candidate_start"] = round(max(0.0, start - 0.15), 6)
        row["candidate_end"] = round(end + 0.15, 6)
    critical = [token for token in CRITICAL if normalized(token) in normalized(spec["text"])]
    row["critical_tokens"] = critical
    row["accepted"] = not reasons
    row["reasons"] = sorted(set(reasons))
    return row


def main() -> None:
    if CLIP_DIR.exists():
        shutil.rmtree(CLIP_DIR)
    CLIP_DIR.mkdir(parents=True)
    rows = [evaluate(spec) for spec in SPECS]
    for row in rows:
        if not row["accepted"]:
            continue
        audio_out = CLIP_DIR / f"{row['id']}.wav"
        lab_out = CLIP_DIR / f"{row['id']}.lab"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-ss", f"{row['candidate_start']:.6f}",
            "-to", f"{row['candidate_end']:.6f}",
            "-i", row["audio_source"], "-map_metadata", "-1",
            "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", "-y", str(audio_out),
        ], check=True)
        lab_out.write_text(row["text"], encoding="utf-8")
        info = sf.info(audio_out)
        row.update({
            "audio": str(audio_out), "lab": str(lab_out),
            "duration_seconds": round(info.duration, 6),
            "audio_sha256": sha256(audio_out), "lab_sha256": sha256(lab_out),
        })
    accepted = [row for row in rows if row["accepted"]]
    duration = round(sum(row["duration_seconds"] for row in accepted), 6)
    report = {
        "schema_version": 1,
        "policy": {
            "dual_asr": "full normalized sentence must occur exactly in large-v3 and large-v3-turbo word streams",
            "critical_tokens": CRITICAL,
            "max_internal_pause_seconds": 1.25,
            "boundary_guard_seconds": 0.15,
            "validation_excluded": True,
            "dataset_threshold_seconds": 120.0,
        },
        "whole_file_decision": "rejected",
        "sentence_salvage": {
            "accepted_count": len(accepted),
            "rejected_count": len(rows) - len(accepted),
            "accepted_duration_seconds": duration,
            "eligible_for_training": duration >= 120.0,
        },
        "sentences": rows,
    }
    RUN_DIR.mkdir(parents=True, exist_ok=True)
    output = RUN_DIR / "sentence-salvage.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["sentence_salvage"], ensure_ascii=False))


if __name__ == "__main__":
    main()
