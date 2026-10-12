"""Materialize an isolated GPT-SoVITS V2 fine-tune dataset.

Only sentence-level clips already admitted by the F4 dual-ASR salvage manifest
are copied. Whole-file recordings and the validation/critical/held-out probes
are deliberately excluded.
"""
from __future__ import annotations

import hashlib
import json
import shutil
import wave
from pathlib import Path

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent
WORKSPACE = Path(__file__).resolve().parents[5]
SOURCE_MANIFEST = WORKSPACE / "03-script-voice/voice-clone/training/F4-20260729/fish-dataset/dataset_manifest.json"
OUT_DATASET = HERE / "dataset"
WAV_DIR = OUT_DATASET / "wavs"
LAB_DIR = OUT_DATASET / "labs"
INPUT_TEXT = OUT_DATASET / "1-text-list.txt"
MANIFEST = OUT_DATASET / "dataset-manifest.json"

CRITICAL = "교권보호국은 제주에서 제조한 텀블러를 봤습니다. 상자를 받았습니다. 경고선을 밟았습니다. 안내판 위치를 바꿨습니다. 경찰은 건조물침입과 재물손괴 가능성을 기록하고 휴대전화 포렌식 자료를 확인했습니다."
HELDOUT = "검찰은 건조물침입과 재물손괴 혐의를 따로 검토했고, 디지털 포렌식 결과도 함께 살폈습니다. 지난 6월 제주 한 학교에서 비슷한 신고가 접수됐습니다. 반복을 막으려면 어떤 보호 장치가 필요할까요?"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


def duration(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        return wf.getnframes() / wf.getframerate()


def main() -> None:
    source_text = SOURCE_MANIFEST.read_text(encoding="utf-8")
    source = json.loads(source_text)
    clips = [row for row in source["clips"] if row.get("split") == "train"]
    if len(clips) != 25 or source.get("validation_clip_count") != 2:
        raise SystemExit("unexpected F4 admission dataset counts")

    # Recreate only pilot-owned output directories.
    WAV_DIR.mkdir(parents=True, exist_ok=True)
    LAB_DIR.mkdir(parents=True, exist_ok=True)
    records = []
    lines = []
    for index, row in enumerate(clips, start=1):
        src_audio = Path(row["audio"])
        src_lab = Path(row["lab"])
        if not src_audio.exists() or not src_lab.exists():
            raise FileNotFoundError(src_audio if not src_audio.exists() else src_lab)
        if src_audio.name.endswith(".full.wav") or "validation" in str(src_audio).lower():
            raise SystemExit(f"whole-file/validation source rejected: {src_audio}")
        text = row["transcript"]
        if text in (CRITICAL, HELDOUT):
            raise SystemExit("critical/held-out text leaked into training")
        stem = f"f4_train_{index:02d}"
        dst_audio = WAV_DIR / f"{stem}.wav"
        dst_lab = LAB_DIR / f"{stem}.lab"
        shutil.copy2(src_audio, dst_audio)
        shutil.copy2(src_lab, dst_lab)
        rec = {
            "index": index,
            "split": "train",
            "source_audio": str(src_audio),
            "source_lab": str(src_lab),
            "audio": str(dst_audio),
            "lab": str(dst_lab),
            "duration_seconds": round(duration(dst_audio), 6),
            "source_audio_sha256": sha256(src_audio),
            "source_lab_sha256": sha256(src_lab),
            "audio_sha256": sha256(dst_audio),
            "lab_sha256": sha256(dst_lab),
            "text": text,
            "text_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest().upper(),
        }
        records.append(rec)
        lines.append(f"{dst_audio}|F4|KO|{text}")

    INPUT_TEXT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    manifest = {
        "schema_version": 1,
        "model": "GPT-SoVITS V2",
        "policy": {
            "source": "F4 sentence-level dual-ASR accepted train clips only",
            "whole_file_raw_training": False,
            "validation_used_in_training": False,
            "validation_used_as_reference_prompt": False,
            "critical_used_in_training": False,
            "critical_used_as_reference_prompt": False,
            "heldout_used_in_training": False,
            "heldout_used_as_reference_prompt": False,
        },
        "source_manifest": str(SOURCE_MANIFEST),
        "source_manifest_sha256": sha256(SOURCE_MANIFEST),
        "train_clip_count": len(records),
        "train_seconds": round(sum(r["duration_seconds"] for r in records), 6),
        "validation_clip_count": source["validation_clip_count"],
        "validation_seconds": source["validation_seconds"],
        "critical_text_sha256": hashlib.sha256(CRITICAL.encode("utf-8")).hexdigest().upper(),
        "heldout_text_sha256": hashlib.sha256(HELDOUT.encode("utf-8")).hexdigest().upper(),
        "input_text": str(INPUT_TEXT),
        "clips": records,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"train_clip_count": len(records), "train_seconds": manifest["train_seconds"], "manifest": str(MANIFEST)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
