"""Build a deterministic two-clip, owned F4 probe subset."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import librosa
import soundfile as sf

ROOT = Path(__file__).resolve().parent
VOICE_CLONE = ROOT.parent
SOURCE_MANIFEST = VOICE_CLONE / "training" / "F4-target-20260729" / "fish-dataset" / "dataset_manifest.json"
REFERENCE = VOICE_CLONE / "pilots" / "model-ab-20260729" / "f4_ref_gyogwon.wav"
DERIVED = ROOT / "derived"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def main() -> None:
    source = json.loads(SOURCE_MANIFEST.read_text(encoding="utf-8"))
    candidates = [
        row for row in source["clips"]
        if row["split"] == "train"
        and row["role"] == "target-remediation"
        and row.get("sampling_copy") == 1
        and 1.0 <= float(row["duration_seconds"]) <= 10.0
    ]
    candidates.sort(key=lambda row: (float(row["duration_seconds"]), row["audio_sha256"]))
    selected, seen = [], set()
    for row in candidates:
        if row["audio_sha256"] not in seen:
            selected.append(row)
            seen.add(row["audio_sha256"])
        if len(selected) == 2:
            break
    if len(selected) != 2:
        raise RuntimeError("need two unique target-remediation clips")
    ref_info = sf.info(str(REFERENCE))
    if ref_info.samplerate != 24000 or ref_info.channels != 1:
        raise RuntimeError("canonical reference must be 24 kHz mono")

    DERIVED.mkdir(parents=True, exist_ok=True)
    raw_rows, provenance = [], []
    for index, row in enumerate(selected, 1):
        source_audio = Path(row["audio"])
        if sha256(source_audio) != row["audio_sha256"].upper():
            raise RuntimeError(f"source hash mismatch: {source_audio}")
        waveform, _ = librosa.load(str(source_audio), sr=24000, mono=True)
        output_audio = DERIVED / f"probe_{index:02d}.wav"
        sf.write(str(output_audio), waveform, 24000, subtype="PCM_16")
        raw_rows.append({"audio": str(output_audio.resolve()), "text": row["transcript"], "ref_audio": str(REFERENCE.resolve())})
        provenance.append({
            "source_audio": str(source_audio),
            "source_audio_sha256": row["audio_sha256"].upper(),
            "derived_audio": str(output_audio.resolve()),
            "derived_audio_sha256": sha256(output_audio),
            "duration_seconds": sf.info(str(output_audio)).duration,
            "role": row["role"],
            "sampling_copy": row["sampling_copy"],
        })
    raw_jsonl = DERIVED / "train_raw.jsonl"
    raw_jsonl.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in raw_rows), encoding="utf-8")
    result = {
        "source_manifest": str(SOURCE_MANIFEST.resolve()),
        "source_manifest_sha256": sha256(SOURCE_MANIFEST),
        "reference_audio": str(REFERENCE.resolve()),
        "reference_audio_sha256": sha256(REFERENCE),
        "selection": provenance,
        "raw_jsonl": str(raw_jsonl.resolve()),
        "raw_jsonl_sha256": sha256(raw_jsonl),
    }
    (DERIVED / "subset_manifest.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "prepared", "rows": 2, "raw_jsonl": str(raw_jsonl)}))


if __name__ == "__main__":
    main()
