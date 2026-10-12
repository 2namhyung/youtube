"""Strict dual-ASR/QC admission for the three F4 target recordings."""

from __future__ import annotations

import hashlib
import json
import os
import math
import re
import subprocess
import unicodedata
from pathlib import Path

import numpy as np
import soundfile as sf


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
RUN = WORKSPACE / "03-script-voice" / "runs" / "F4-target-20260729"
SOURCE = Path(os.environ["OWNER_RECORDING_DIR"])
SOURCES = {
    "songoeg": SOURCE / "F4_target_songoeg.m4a.m4a",
    "bwat": SOURCE / "F4_target_bwat.m4a.m4a",
    "gyogwon": SOURCE / "F4_target_gyogwon.m4a.m4a",
}
CANONICAL = {
    "songoeg": [
        "경찰은 재물손괴 혐의를 검토했습니다.",
        "건조물침입과 재물손괴는 서로 다른 혐의입니다.",
        "수사관은 재물손괴 여부를 확인한 뒤 사건 경위를 조사했습니다.",
    ],
    "bwat": [
        "교사는 복도에 남은 흔적을 봤습니다.",
        "신고를 받은 경찰이 현장을 확인했습니다.",
        "조사관은 경고선을 밟았습니다.",
        "담당자는 표지판 위치를 바꿨습니다.",
    ],
    "gyogwon": [
        "교권보호국은 교권을 보호하는 가상의 기관입니다.",
        "현실의 교권 보호 제도는 제대로 작동하고 있을까요?",
        "교권과 권한은 서로 다른 의미를 가집니다.",
    ],
}
CRITICAL = {
    "songoeg": ["재물손괴"],
    "bwat": ["봤습니다", "받은", "밟았습니다", "바꿨습니다"],
    "gyogwon": ["교권보호국", "교권", "권한"],
}
MAX_INTERNAL_PAUSE_SECONDS = 1.25


def normalized(text: str) -> str:
    return "".join(re.findall(r"[0-9A-Za-z가-힣]+", unicodedata.normalize("NFKC", text)))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def asr(engine: str, name: str) -> dict:
    path = ROOT / f"asr-{engine}" / f"{name}.full.asr.json"
    return json.loads(path.read_text(encoding="utf-8"))


def ebur128(path: Path) -> dict:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-filter_complex", "ebur128=peak=true", "-f", "null", "NUL"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
    )
    text = result.stderr
    summary = text.rsplit("Summary:", 1)[-1]
    def value(pattern: str) -> float:
        match = re.search(pattern, summary)
        if not match:
            raise RuntimeError(f"Missing ebur128 metric {pattern} for {path}")
        return float(match.group(1))
    return {
        "integrated_lufs": value(r"I:\s+(-?[0-9.]+) LUFS"),
        "lra_lu": value(r"LRA:\s+(-?[0-9.]+) LU"),
        "true_peak_dbfs": value(r"Peak:\s+(-?[0-9.]+) dBFS"),
    }


def silence_ranges(path: Path) -> list[dict]:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "silencedetect=noise=-42dB:d=0.25", "-f", "null", "NUL"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
    )
    starts = [float(item) for item in re.findall(r"silence_start: ([0-9.]+)", result.stderr)]
    ends = [(float(a), float(b)) for a, b in re.findall(r"silence_end: ([0-9.]+) \| silence_duration: ([0-9.]+)", result.stderr)]
    return [
        {"start": round(start, 6), "end": round(end, 6), "duration": round(duration, 6)}
        for start, (end, duration) in zip(starts, ends)
    ]


def audio_qc(name: str) -> dict:
    path = ROOT / "admission-work" / f"{name}.full.wav"
    audio, sr = sf.read(path, dtype="float32", always_2d=True)
    mono = audio[:, 0]
    peak = float(np.max(np.abs(mono), initial=0.0))
    rms = float(np.sqrt(np.mean(np.square(mono), dtype=np.float64)))
    silences = silence_ranges(path)
    return {
        "pcm_path": str(path), "pcm_sha256": sha256(path),
        "duration_seconds": round(len(mono) / sr, 6), "sample_rate": sr,
        "channels": audio.shape[1], "subtype": sf.info(path).subtype,
        **ebur128(path),
        "sample_peak_dbfs": round(20 * math.log10(max(peak, 1e-12)), 3),
        "rms_dbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
        "clipped_samples": int(np.count_nonzero(np.abs(mono) >= 0.999969)),
        "silence_threshold_dbfs": -42,
        "silences": silences,
        "max_detected_silence_seconds": max((x["duration"] for x in silences), default=0.0),
    }


def flatten_words(payload: dict) -> list[dict]:
    return [word for segment in payload["segments"] for word in segment.get("words", [])]


def sentence_ranges(payload: dict, sentences: list[str]) -> list[dict]:
    words = flatten_words(payload)
    output = []
    cursor = 0
    for sentence in sentences:
        expected = normalized(sentence)
        collected = ""
        start_index = cursor
        while cursor < len(words) and len(collected) < len(expected):
            collected += normalized(words[cursor]["word"])
            cursor += 1
        chosen = words[start_index:cursor]
        gaps = [max(0.0, chosen[i + 1]["start"] - chosen[i]["end"]) for i in range(len(chosen) - 1)]
        output.append({
            "text": sentence,
            "recognized_normalized": collected,
            "exact": collected == expected,
            "start": round(chosen[0]["start"], 6) if chosen else None,
            "end": round(chosen[-1]["end"], 6) if chosen else None,
            "max_internal_pause_seconds": round(max(gaps, default=0.0), 6),
            "no_long_internal_pause": max(gaps, default=0.0) <= MAX_INTERNAL_PAUSE_SECONDS,
        })
    return output


def main() -> None:
    RUN.mkdir(parents=True, exist_ok=True)
    records = {}
    all_pass = True
    for name, source in SOURCES.items():
        expected_text = " ".join(CANONICAL[name])
        engines = {}
        for engine in ("primary", "turbo"):
            payload = asr(engine, name)
            transcript = " ".join(segment["text"] for segment in payload["segments"])
            ranges = sentence_ranges(payload, CANONICAL[name])
            critical = {token: normalized(token) in normalized(transcript) for token in CRITICAL[name]}
            engine_pass = (
                normalized(transcript) == normalized(expected_text)
                and all(critical.values())
                and all(item["exact"] and item["no_long_internal_pause"] for item in ranges)
            )
            engines[engine] = {
                "model": payload["model"], "transcript": transcript,
                "full_text_exact_normalized": normalized(transcript) == normalized(expected_text),
                "critical_tokens": critical, "sentences": ranges,
                "accepted": engine_pass,
            }
            all_pass = all_pass and engine_pass
        qc = audio_qc(name)
        qc_pass = qc["clipped_samples"] == 0 and qc["true_peak_dbfs"] < 0
        all_pass = all_pass and qc_pass
        records[name] = {
            "source": str(source), "source_sha256": sha256(source),
            "source_bytes": source.stat().st_size, "canonical_sentences": CANONICAL[name],
            "critical_tokens": CRITICAL[name], "qc": qc, "qc_accepted": qc_pass,
            "asr": engines,
        }
    report = {
        "schema_version": 1,
        "decision": "ACCEPTED_FOR_TARGET_REMEDIATION" if all_pass else "REJECTED_BEFORE_TRAINING",
        "accepted_for_training": all_pass,
        "policy": {
            "dual_asr_full_text_exact_after_punctuation_whitespace_normalization": True,
            "critical_tokens_exact_in_both_asr": True,
            "max_internal_pause_seconds": MAX_INTERNAL_PAUSE_SECONDS,
            "no_false_start_or_restart": True,
        },
        "recordings": records,
        "validation_lock": {
            "source_sha256": "180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8",
            "pcm_sha256": "47844B884948F67B3BEA8F88742F1C6C9A1073410F4B6FC3699C2A1FF06859EF",
            "training_use": False, "augmentation_use": False, "prompt_use": False,
        },
        "dataset_created": False,
        "training_started": False,
    }
    output = RUN / "target-admission.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output), "decision": report["decision"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
