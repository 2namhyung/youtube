"""Create the F4 salvage + 2x target remediation dataset with isolated val."""

from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

import soundfile as sf


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
ADMISSION = WORKSPACE / "03-script-voice" / "runs" / "F4-target-20260729" / "target-admission.json"
OLD_DATASET = WORKSPACE / "03-script-voice" / "voice-clone" / "training" / "F4-20260729" / "fish-dataset"
OUTPUT = ROOT / "fish-dataset"
TARGET_SAMPLING_FACTOR = 2
GUARD_SECONDS = 0.15


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def record(audio: Path, lab: Path, split: str, source: str, role: str, sampling_copy: int = 1) -> dict:
    info = sf.info(audio)
    return {
        "split": split, "role": role, "sampling_copy": sampling_copy,
        "source": source, "audio": str(audio), "lab": str(lab),
        "duration_seconds": round(info.duration, 6), "sample_rate": info.samplerate,
        "channels": info.channels, "subtype": info.subtype,
        "audio_sha256": sha256(audio), "lab_sha256": sha256(lab),
        "transcript": lab.read_text(encoding="utf-8"),
    }


def main() -> None:
    admission = json.loads(ADMISSION.read_text(encoding="utf-8"))
    if not admission["accepted_for_training"]:
        raise SystemExit("Target admission did not pass")
    old_manifest = json.loads((OLD_DATASET / "dataset_manifest.json").read_text(encoding="utf-8"))
    if old_manifest["train_clip_count"] != 25 or old_manifest["train_seconds"] != 125.0:
        raise SystemExit("Expected immutable 25-clip/125-second F4 salvage base")
    if old_manifest["validation_source_sha256"] != "180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8":
        raise SystemExit("Validation source hash lock mismatch")
    if old_manifest["validation_pcm_sha256"] != "47844B884948F67B3BEA8F88742F1C6C9A1073410F4B6FC3699C2A1FF06859EF":
        raise SystemExit("Validation PCM hash lock mismatch")
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    train = OUTPUT / "train" / "F4"
    val = OUTPUT / "val" / "F4"
    train.mkdir(parents=True)
    val.mkdir(parents=True)
    records = []

    for old in old_manifest["clips"]:
        if old["split"] != "train":
            continue
        source_audio, source_lab = Path(old["audio"]), Path(old["lab"])
        audio, lab = train / f"base_{source_audio.name}", train / f"base_{source_lab.name}"
        shutil.copy2(source_audio, audio)
        shutil.copy2(source_lab, lab)
        if sha256(audio) != old["audio_sha256"] or sha256(lab) != old["lab_sha256"]:
            raise SystemExit(f"Base copy mismatch: {source_audio.name}")
        records.append(record(audio, lab, "train", old["source"], "salvage-base"))

    target_unique = 0
    for name, item in admission["recordings"].items():
        source_audio = Path(item["qc"]["pcm_path"])
        source_data, sr = sf.read(source_audio, dtype="int16", always_2d=True)
        for index, sentence in enumerate(item["asr"]["primary"]["sentences"], start=1):
            if not sentence["exact"] or not sentence["no_long_internal_pause"]:
                raise SystemExit(f"Unadmitted target sentence: {name}_{index}")
            target_unique += 1
            start = max(0, int(round((sentence["start"] - GUARD_SECONDS) * sr)))
            end = min(len(source_data), int(round((sentence["end"] + GUARD_SECONDS) * sr)))
            clip = source_data[start:end]
            for copy_index in range(1, TARGET_SAMPLING_FACTOR + 1):
                stem = f"target_{name}_{index:02d}_x{copy_index}"
                audio, lab = train / f"{stem}.wav", train / f"{stem}.lab"
                sf.write(audio, clip, sr, subtype="PCM_16")
                lab.write_text(sentence["text"], encoding="utf-8")
                records.append(record(
                    audio, lab, "train", str(source_audio), "target-remediation", copy_index
                ))

    for old in old_manifest["clips"]:
        if old["split"] != "validation":
            continue
        source_audio, source_lab = Path(old["audio"]), Path(old["lab"])
        audio, lab = val / source_audio.name, val / source_lab.name
        shutil.copy2(source_audio, audio)
        shutil.copy2(source_lab, lab)
        if sha256(audio) != old["audio_sha256"] or sha256(lab) != old["lab_sha256"]:
            raise SystemExit(f"Validation copy mismatch: {source_audio.name}")
        records.append(record(audio, lab, "validation", old["source"], "heldout-validation"))

    manifest = {
        "schema_version": 1, "speaker": "F4-target-remediation",
        "policy": {
            "salvage_base_sampling_factor": 1,
            "target_sampling_factor": TARGET_SAMPLING_FACTOR,
            "target_sampling_factor_maximum": 2,
            "validation_hash_locked_and_isolated": True,
            "validation_used_in_training": False,
            "validation_used_in_augmentation": False,
            "validation_used_as_reference_prompt": False,
            "augmentation": "none",
        },
        "source_admission": str(ADMISSION),
        "source_admission_sha256": sha256(ADMISSION),
        "salvage_manifest": str(OLD_DATASET / "dataset_manifest.json"),
        "salvage_manifest_sha256": sha256(OLD_DATASET / "dataset_manifest.json"),
        "validation_source_sha256": old_manifest["validation_source_sha256"],
        "validation_pcm_sha256": old_manifest["validation_pcm_sha256"],
        "salvage_base_clip_count": 25,
        "salvage_base_seconds": 125.0,
        "target_unique_sentence_count": target_unique,
        "target_materialized_clip_count": target_unique * TARGET_SAMPLING_FACTOR,
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
        "target_unique_sentence_count", "target_materialized_clip_count",
        "train_clip_count", "train_seconds", "validation_clip_count", "validation_seconds"
    )}, ensure_ascii=False))


if __name__ == "__main__":
    main()
