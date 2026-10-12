"""Build the owned F4 perceptual train/validation manifests, fail closed."""
from __future__ import annotations

import hashlib
import json
import math
import random
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parent
VOICE_CLONE = ROOT.parent
SOURCE = VOICE_CLONE / "training" / "F4-target-20260729" / "fish-dataset" / "dataset_manifest.json"
REFERENCE = VOICE_CLONE / "pilots" / "model-ab-20260729" / "f4_ref_gyogwon.wav"
OUT = ROOT / "perceptual_data"
SEED = 20260730
PROTECTED_VALIDATION_SOURCE_SHA256 = "180AC9954D84B3A7AC6ED5E4CFAAB0F53DF35F1E03CF64CFDB39FE6FBF2B7DE8"
PROTECTED_VALIDATION_PCM_SHA256 = "47844B884948F67B3BEA8F88742F1C6C9A1073410F4B6FC3699C2A1FF06859EF"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def wav_gate(path: Path, expected_duration: float | None = None) -> dict:
    audio, sr = sf.read(str(path), dtype="float32", always_2d=False)
    if audio.ndim != 1 or sr != 24000 or not np.isfinite(audio).all() or len(audio) == 0:
        raise RuntimeError(f"invalid owned WAV: {path}")
    peak = float(np.max(np.abs(audio)))
    duration = len(audio) / sr
    max_jump = float(np.max(np.abs(np.diff(audio)))) if len(audio) > 1 else 0.0
    edge = float(max(abs(audio[0]), abs(audio[-1])))
    if peak >= 0.999 or max_jump > 0.75 or edge > 0.25:
        raise RuntimeError(f"artifact gate failed: {path} peak={peak} jump={max_jump} edge={edge}")
    if expected_duration is not None and abs(duration - expected_duration) > max(0.08, expected_duration * 0.03):
        raise RuntimeError(f"duration gate failed: {path}")
    return {"sample_rate": sr, "duration_seconds": duration, "peak": peak, "max_adjacent_jump": max_jump, "edge_amplitude": edge}


def ffmpeg_convert(source: Path, output: Path, tempo: float | None = None) -> None:
    command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source), "-ac", "1", "-ar", "24000"]
    if tempo is not None:
        command += ["-af", f"atempo={tempo:.8f}"]
    command += ["-c:a", "pcm_s16le", str(output)]
    subprocess.run(command, check=True, timeout=60)


def clean_text(text: str) -> bool:
    normalized = re.sub(r"\s+", "", text)
    return bool(normalized) and any("가" <= char <= "힣" for char in normalized) and "�" not in text


def main() -> None:
    source = json.loads(SOURCE.read_text(encoding="utf-8"))
    if not source["policy"]["validation_hash_locked_and_isolated"] or source["policy"]["validation_used_in_training"]:
        raise RuntimeError("source validation policy is not fail-closed")
    train_rows = [row for row in source["clips"] if row["split"] == "train" and row.get("sampling_copy") == 1]
    validation_rows = [row for row in source["clips"] if row["split"] == "validation"]
    unique: dict[str, dict] = {}
    for row in train_rows:
        if not clean_text(row["transcript"]):
            continue
        audio = Path(row["audio"])
        if sha256(audio) != row["audio_sha256"].upper():
            raise RuntimeError(f"source hash mismatch: {audio}")
        unique.setdefault(row["audio_sha256"].upper(), row)
    if len(unique) != 35:
        raise RuntimeError(f"expected 35 exact-transcript unique train clips, got {len(unique)}")
    protected = {row["audio_sha256"].upper() for row in validation_rows}
    if protected & set(unique):
        raise RuntimeError("validation audio hash leaked into training")

    raw_dir, aug_dir = OUT / "raw_24k", OUT / "augmented_24k"
    raw_dir.mkdir(parents=True, exist_ok=True)
    aug_dir.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)
    rows, audit = [], []
    sorted_rows = sorted(unique.values(), key=lambda row: row["audio_sha256"])
    for index, row in enumerate(sorted_rows, 1):
        source_audio = Path(row["audio"])
        output = raw_dir / f"raw_{index:03d}.wav"
        ffmpeg_convert(source_audio, output)
        metrics = wav_gate(output, float(row["duration_seconds"]))
        item = {"audio": str(output.resolve()), "text": row["transcript"], "ref_audio": str(REFERENCE.resolve())}
        rows.append(item)
        audit.append({
            "kind": "raw-original-resampled", "seed": None, "transform": {"resample_hz": 24000, "channels": 1},
            "source_audio": str(source_audio), "source_sha256": row["audio_sha256"].upper(),
            "output_audio": str(output.resolve()), "output_sha256": sha256(output), "text_sha256": hashlib.sha256(row["transcript"].encode("utf-8")).hexdigest().upper(),
            "role": row["role"], "metrics": metrics,
        })

    # Exactly 17 mild, relative time-scale transforms: 35/52 = 67.3% raw.
    for aug_index, row in enumerate(sorted_rows[::2][:17], 1):
        source_index = sorted_rows.index(row) + 1
        source_audio = raw_dir / f"raw_{source_index:03d}.wav"
        local_seed = SEED + aug_index
        local = random.Random(local_seed)
        tempo = local.uniform(0.97, 1.03)
        if abs(tempo - 1.0) < 0.008:
            tempo = 1.012 if tempo >= 1 else 0.988
        output = aug_dir / f"tempo_{aug_index:03d}.wav"
        ffmpeg_convert(source_audio, output, tempo=tempo)
        expected_duration = sf.info(str(source_audio)).duration / tempo
        metrics = wav_gate(output, expected_duration)
        if row["transcript"] != rows[source_index - 1]["text"]:
            raise RuntimeError("augmentation transcript mismatch")
        rows.append({"audio": str(output.resolve()), "text": row["transcript"], "ref_audio": str(REFERENCE.resolve())})
        audit.append({
            "kind": "mild-relative-tempo", "seed": local_seed,
            "transform": {"engine": "ffmpeg-atempo", "tempo_factor": tempo, "pitch_shift_semitones": 0.0, "inserted_silence_seconds": 0.0},
            "source_audio": str(source_audio.resolve()), "source_sha256": sha256(source_audio),
            "output_audio": str(output.resolve()), "output_sha256": sha256(output), "text_sha256": hashlib.sha256(row["transcript"].encode("utf-8")).hexdigest().upper(),
            "role": row["role"], "metrics": metrics,
        })
    raw_count = sum(entry["kind"] == "raw-original-resampled" for entry in audit)
    if raw_count / len(rows) < 0.5:
        raise RuntimeError("raw-original share fell below 50%")

    train_jsonl = OUT / "train_raw.jsonl"
    train_jsonl.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows), encoding="utf-8")
    # Validation is referenced read-only, never copied, transformed, trained, or used as reference.
    validation_jsonl = OUT / "validation_raw.jsonl"
    validation_payload = [{"audio": row["audio"], "text": row["transcript"], "ref_audio": str(REFERENCE.resolve())} for row in validation_rows]
    validation_jsonl.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in validation_payload), encoding="utf-8")
    manifest = {
        "status": "admitted", "seed": SEED, "source_manifest": str(SOURCE.resolve()), "source_manifest_sha256": sha256(SOURCE),
        "protected_validation": {"row_audio_sha256": sorted(protected), "source_sha256": PROTECTED_VALIDATION_SOURCE_SHA256, "pcm_sha256": PROTECTED_VALIDATION_PCM_SHA256,
                                 "used_in_training": False, "used_in_augmentation": False, "used_as_reference": False},
        "counts": {"audited_unique_train": len(unique), "raw_original": raw_count, "mild_augmented": len(rows) - raw_count, "total_train": len(rows),
                   "raw_fraction": raw_count / len(rows), "validation": len(validation_rows)},
        "policy": {"third_party_waveform": False, "third_party_embedding": False, "absolute_pitch_target": False, "fixed_pitch_fall": False,
                   "inserted_silence": False, "augmentation": "relative ffmpeg atempo 0.97..1.03; pitch/formants retained"},
        "train_jsonl": str(train_jsonl.resolve()), "train_jsonl_sha256": sha256(train_jsonl),
        "validation_jsonl": str(validation_jsonl.resolve()), "validation_jsonl_sha256": sha256(validation_jsonl), "clips": audit,
    }
    (OUT / "dataset_audit.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "admitted", **manifest["counts"]}))


if __name__ == "__main__":
    main()
