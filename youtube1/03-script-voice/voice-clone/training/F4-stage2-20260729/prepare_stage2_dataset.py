"""Validate the stacked base and materialize the isolated F4 stage-2 mix."""

from __future__ import annotations

import hashlib
import json
import shutil
import wave
from pathlib import Path

import torch


ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[3]
FISH = Path(r"C:\Users\User\tools\fish-speech")
BASE = FISH / "checkpoints" / "fish-speech-1.5"
STACKED = FISH / "checkpoints" / "fish-speech-1.5-F4-target-r8-step40-20260729"
STAGE1_LORA = FISH / "results" / "F4_target_remediation_20260729_base_r8" / "checkpoints" / "step_000000040.ckpt"
SOURCE_ROOT = WORKSPACE / "03-script-voice" / "voice-clone" / "training" / "F4-target-20260729" / "fish-dataset"
SOURCE_MANIFEST = SOURCE_ROOT / "dataset_manifest.json"
OUTPUT = ROOT / "fish-dataset-v2"
GENERAL_IDS = {
    "base_old_04", "base_old_05", "base_s02_01", "base_s02_02", "base_s02_03",
    "base_s04_05", "base_s05_01", "base_s06_04", "base_s07_04", "base_s07_07",
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def wav_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as stream:
        return stream.getnframes() / stream.getframerate()


def validate_stacked_base() -> dict:
    required = ["model.pth", "config.json", "special_tokens.json", "tokenizer.tiktoken"]
    missing = [name for name in required if not (STACKED / name).is_file()]
    if missing:
        raise RuntimeError(f"stacked base missing: {missing}")
    base_state = torch.load(BASE / "model.pth", map_location="cpu", weights_only=True)
    stacked_state = torch.load(STACKED / "model.pth", map_location="cpu", weights_only=True)
    if set(base_state) != set(stacked_state):
        raise RuntimeError("stacked/base key sets differ")
    shape_mismatches = [key for key in base_state if base_state[key].shape != stacked_state[key].shape]
    if shape_mismatches:
        raise RuntimeError(f"shape mismatch: {shape_mismatches[:3]}")
    changed = [key for key in base_state if not torch.equal(base_state[key], stacked_state[key])]
    if not changed:
        raise RuntimeError("stacked checkpoint is bytewise tensor-identical to base")
    return {
        "base_path": str(BASE),
        "base_model_sha256": sha256(BASE / "model.pth"),
        "stage1_lora_path": str(STAGE1_LORA),
        "stage1_lora_sha256": sha256(STAGE1_LORA),
        "stacked_base_path": str(STACKED),
        "stacked_model_sha256": sha256(STACKED / "model.pth"),
        "tensor_key_count": len(base_state),
        "changed_tensor_count": len(changed),
        "shape_match": True,
        "required_files_present": True,
    }


def copy_triplet(source_audio: Path, source_lab: Path, destination: Path, stem: str) -> tuple[Path, Path]:
    audio = destination / f"{stem}.wav"
    lab = destination / f"{stem}.lab"
    shutil.copy2(source_audio, audio)
    shutil.copy2(source_lab, lab)
    source_npy = source_audio.with_suffix(".npy")
    if source_npy.exists():
        shutil.copy2(source_npy, destination / f"{stem}.npy")
    return audio, lab


def main() -> None:
    if OUTPUT.exists():
        raise SystemExit(f"refusing to overwrite existing dataset: {OUTPUT}")
    provenance = validate_stacked_base()
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    train_dir = OUTPUT / "train" / "F4"
    val_dir = OUTPUT / "val" / "F4"
    train_dir.mkdir(parents=True)
    val_dir.mkdir(parents=True)
    records: list[dict] = []

    target = [row for row in source["clips"] if row["split"] == "train" and row["role"] == "target-remediation"]
    unique_target = {Path(row["audio"]).stem.rsplit("_x", 1)[0] for row in target}
    if len(target) != 20 or len(unique_target) != 10:
        raise RuntimeError(f"target contract mismatch: materialized={len(target)}, unique={len(unique_target)}")
    general = [row for row in source["clips"] if row["split"] == "train" and Path(row["audio"]).stem in GENERAL_IDS]
    if len(general) != 10:
        raise RuntimeError(f"general representative mismatch: {len(general)}")
    validation = [row for row in source["clips"] if row["split"] == "validation"]
    if len(validation) != 2:
        raise RuntimeError(f"validation contract mismatch: {len(validation)}")

    for row in target + general:
        source_audio, source_lab = Path(row["audio"]), Path(row["lab"])
        role = "target-remediation-x2" if row in target else "general-salvage-representative"
        stem = Path(row["audio"]).stem if row in target else f"general_{Path(row['audio']).stem}"
        audio, lab = copy_triplet(source_audio, source_lab, train_dir, stem)
        records.append({
            "split": "train", "role": role, "stem": stem,
            "source_audio": str(source_audio), "audio": str(audio), "lab": str(lab),
            "duration_seconds": round(wav_seconds(audio), 6),
            "audio_sha256": sha256(audio), "lab_sha256": sha256(lab),
            "transcript": lab.read_text(encoding="utf-8").strip(),
        })

    for row in validation:
        source_audio, source_lab = Path(row["audio"]), Path(row["lab"])
        stem = Path(row["audio"]).stem
        audio, lab = copy_triplet(source_audio, source_lab, val_dir, stem)
        records.append({
            "split": "val", "role": "heldout-validation-hash-locked", "stem": stem,
            "source_audio": str(source_audio), "audio": str(audio), "lab": str(lab),
            "duration_seconds": round(wav_seconds(audio), 6),
            "audio_sha256": sha256(audio), "lab_sha256": sha256(lab),
            "source_audio_sha256": sha256(source_audio), "source_lab_sha256": sha256(source_lab),
            "transcript": lab.read_text(encoding="utf-8").strip(),
        })

    train = [row for row in records if row["split"] == "train"]
    val = [row for row in records if row["split"] == "val"]
    manifest = {
        "schema_version": 1,
        "purpose": "F4 target-pronunciation stage-2 correction on CPU-merged stage-1 base",
        "adapter": {"rank": 4, "alpha": 8, "dropout": 0.01, "fresh_optimizer": True},
        "stacked_base_provenance": provenance,
        "source_manifest": str(SOURCE_MANIFEST),
        "source_manifest_sha256": sha256(SOURCE_MANIFEST),
        "train_clip_count": len(train),
        "train_seconds": round(sum(row["duration_seconds"] for row in train), 6),
        "target_unique_sentence_count": len(unique_target),
        "target_materialized_clip_count": len(target),
        "general_representative_clip_count": len(general),
        "validation_clip_count": len(val),
        "validation_seconds": round(sum(row["duration_seconds"] for row in val), 6),
        "validation_source_hash_lock": [
            {"stem": row["stem"], "audio_sha256": row["source_audio_sha256"], "lab_sha256": row["source_lab_sha256"]}
            for row in val
        ],
        "records": records,
    }
    (OUTPUT / "dataset_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({
        "train_clip_count": len(train), "train_seconds": manifest["train_seconds"],
        "target_unique": len(unique_target), "target_materialized": len(target),
        "general": len(general), "validation": len(val), "provenance": provenance,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
