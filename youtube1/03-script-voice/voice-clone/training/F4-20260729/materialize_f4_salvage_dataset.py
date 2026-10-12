"""Materialize the admitted F4 sentence salvage clips and isolated validation."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path

import soundfile as sf


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
SALVAGE_REPORT = WORKSPACE / "03-script-voice" / "runs" / "F4-20260729" / "sentence-salvage.json"
OUTPUT = ROOT / "fish-dataset"
VALIDATION_PCM = WORKSPACE / "03-script-voice" / "voice-clone" / "training" / "F4-20260728" / "validation-lock" / "F4_validation.full.wav"
VALIDATION_SOURCE = Path(os.environ["OWNER_VALIDATION_RECORDING"])
EXPECTED_VALIDATION_SOURCE_SHA = "180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8"

VALIDATION = [
    {
        "id": "f4_val_01", "start": 0.82, "end": 7.82,
        "text": "검찰은 건조물침입과 재물손괴 혐의를 따로 검토했고, 디지털 포렌식 결과도 함께 살폈습니다.",
    },
    {
        "id": "f4_val_02", "start": 9.60, "end": 17.40,
        "text": "지난 6월 제주 한 학교에서 비슷한 신고가 접수됐습니다. 반복을 막으려면 어떤 보호 장치가 필요할까요?",
    },
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def record(audio: Path, lab: Path, split: str, source: str) -> dict:
    info = sf.info(audio)
    return {
        "split": split, "source": source,
        "audio": str(audio), "lab": str(lab),
        "duration_seconds": round(info.duration, 6),
        "sample_rate": info.samplerate, "channels": info.channels,
        "subtype": info.subtype,
        "audio_sha256": sha256(audio), "lab_sha256": sha256(lab),
        "transcript": lab.read_text(encoding="utf-8"),
    }


def main() -> None:
    report = json.loads(SALVAGE_REPORT.read_text(encoding="utf-8"))
    summary = report["sentence_salvage"]
    if not summary["eligible_for_training"] or summary["accepted_duration_seconds"] < 120:
        raise SystemExit("Sentence salvage did not reach the 120-second training gate")
    if sha256(VALIDATION_SOURCE) != EXPECTED_VALIDATION_SOURCE_SHA:
        raise SystemExit("Held-out validation source hash changed")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    train_dir = OUTPUT / "train" / "F4"
    val_dir = OUTPUT / "val" / "F4"
    train_dir.mkdir(parents=True)
    val_dir.mkdir(parents=True)
    records = []
    for row in report["sentences"]:
        if not row["accepted"]:
            continue
        source_audio = Path(row["audio"])
        source_lab = Path(row["lab"])
        target_audio = train_dir / source_audio.name
        target_lab = train_dir / source_lab.name
        shutil.copy2(source_audio, target_audio)
        shutil.copy2(source_lab, target_lab)
        if sha256(target_audio) != row["audio_sha256"] or sha256(target_lab) != row["lab_sha256"]:
            raise SystemExit(f"Copy hash mismatch: {row['id']}")
        records.append(record(target_audio, target_lab, "train", row["audio_source"]))
    for item in VALIDATION:
        audio = val_dir / f"{item['id']}.wav"
        lab = val_dir / f"{item['id']}.lab"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-ss", f"{item['start']:.6f}", "-to", f"{item['end']:.6f}",
            "-i", str(VALIDATION_PCM), "-map_metadata", "-1",
            "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", "-y", str(audio),
        ], check=True)
        lab.write_text(item["text"], encoding="utf-8")
        records.append(record(audio, lab, "validation", str(VALIDATION_PCM)))
    manifest = {
        "schema_version": 1,
        "speaker": "F4-salvage",
        "policy": {
            "training": "only dual-ASR exact sentence salvage clips; no augmentation",
            "validation": "hash-locked held-out recording; validation only",
            "validation_used_in_training": False,
            "validation_used_as_reference_prompt": False,
            "validation_used_in_augmentation": False,
        },
        "validation_source_sha256": sha256(VALIDATION_SOURCE),
        "validation_pcm_sha256": sha256(VALIDATION_PCM),
        "train_clip_count": sum(r["split"] == "train" for r in records),
        "train_seconds": round(sum(r["duration_seconds"] for r in records if r["split"] == "train"), 6),
        "validation_clip_count": sum(r["split"] == "validation" for r in records),
        "validation_seconds": round(sum(r["duration_seconds"] for r in records if r["split"] == "validation"), 6),
        "clips": records,
    }
    (OUTPUT / "dataset_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({key: manifest[key] for key in (
        "train_clip_count", "train_seconds", "validation_clip_count", "validation_seconds"
    )}, ensure_ascii=False))


if __name__ == "__main__":
    main()
