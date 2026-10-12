"""Build a Fish Speech dataset with reference-guided prosody augmentation.

Only the owner's recordings are emitted. Third-party reference audio is reduced
to numeric tempo and terminal-cadence targets and is never copied into training.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
from pathlib import Path


REFERENCE_TARGETS = {
    "neutral": {"tempo_cps": 6.90, "terminal_semitones": -0.55},
    "hook": {"tempo_cps": 7.71, "terminal_semitones": -0.65},
    "news": {"tempo_cps": 7.31, "terminal_semitones": -0.59},
    "tension": {"tempo_cps": 7.31, "terminal_semitones": -0.67},
    "criticism": {"tempo_cps": 7.71, "terminal_semitones": -0.65},
    "solution": {"tempo_cps": 6.90, "terminal_semitones": -0.51},
    "final": {"tempo_cps": 7.31, "terminal_semitones": -0.59},
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def spoken_char_count(text: str) -> int:
    return len(re.sub(r"[^0-9A-Za-z가-힣]", "", text))


def style_for(clip_id: str) -> str:
    for style in REFERENCE_TARGETS:
        if f"_{style}_" in clip_id:
            return style
    return "neutral"


def ffmpeg_augment(source: Path, output: Path, duration: float, tempo: float, terminal_st: float) -> None:
    transformed_duration = duration / tempo
    overlap = min(0.025, transformed_duration * 0.02)
    split_at = transformed_duration * 0.72
    tail_start = max(0.0, split_at - overlap)
    pitch_ratio = math.pow(2.0, terminal_st / 12.0)
    filter_graph = (
        f"[0:a]rubberband=tempo={tempo:.6f}:transients=mixed:detector=compound:"
        "phase=laminar:window=standard:smoothing=on:formant=preserved[tempo];"
        "[tempo]asplit=2[pre0][tail0];"
        f"[pre0]atrim=start=0:end={split_at:.6f},asetpts=PTS-STARTPTS[pre];"
        f"[tail0]atrim=start={tail_start:.6f},asetpts=PTS-STARTPTS,"
        f"rubberband=pitch={pitch_ratio:.8f}:transients=smooth:detector=soft:"
        "phase=laminar:window=long:smoothing=on:formant=preserved[tail];"
        f"[pre][tail]acrossfade=d={overlap:.6f}:c1=tri:c2=tri[out]"
    )
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-filter_complex", filter_graph, "-map", "[out]", "-ar", "24000", "-ac", "1",
            "-c:a", "pcm_s16le", str(output),
        ],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-manifest", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    args = parser.parse_args()

    manifest = json.loads(args.source_manifest.read_text(encoding="utf-8"))
    if args.output_root.exists():
        shutil.rmtree(args.output_root)

    output_clips = []
    for clip in manifest["clips"]:
        split = clip["split"]
        speaker_dir = args.output_root / split / "F"
        speaker_dir.mkdir(parents=True, exist_ok=True)
        source_audio = Path(clip["audio"])
        source_lab = Path(clip["lab"])
        original_audio = speaker_dir / source_audio.name
        original_lab = speaker_dir / source_lab.name
        shutil.copy2(source_audio, original_audio)
        shutil.copy2(source_lab, original_lab)
        copied = dict(clip)
        copied.update(
            audio=str(original_audio), lab=str(original_lab),
            audio_sha256=sha256(original_audio), lab_sha256=sha256(original_lab),
            augmentation=None,
        )
        output_clips.append(copied)

        # Validation stays untouched so it measures the learned voice rather than
        # the deterministic transform. Every accepted training clip gets one
        # reference-guided owner-voice counterpart.
        if split != "train":
            continue
        style = style_for(clip["id"])
        target = REFERENCE_TARGETS[style]
        chars = max(1, spoken_char_count(clip["transcript"]))
        source_cps = chars / clip["duration_seconds"]
        tempo = max(0.92, min(1.08, target["tempo_cps"] / source_cps))
        terminal_st = 0.35 if clip["transcript"].rstrip().endswith("?") else target["terminal_semitones"]
        augmented_id = f"{clip['id']}_refprosody"
        augmented_audio = speaker_dir / f"{augmented_id}.wav"
        augmented_lab = speaker_dir / f"{augmented_id}.lab"
        ffmpeg_augment(source_audio, augmented_audio, clip["duration_seconds"], tempo, terminal_st)
        shutil.copy2(source_lab, augmented_lab)
        output_clips.append(
            {
                **clip,
                "id": augmented_id,
                "audio": str(augmented_audio),
                "lab": str(augmented_lab),
                "duration_seconds": clip["duration_seconds"] / tempo,
                "audio_sha256": sha256(augmented_audio),
                "lab_sha256": sha256(augmented_lab),
                "augmentation": {
                    "source_is_owner_voice": True,
                    "reference_audio_included": False,
                    "reference_profile": "voice-clone/instagram-prosody-profile.json",
                    "style": style,
                    "source_chars_per_second": round(source_cps, 4),
                    "target_chars_per_second": target["tempo_cps"],
                    "tempo_factor": round(tempo, 6),
                    "terminal_pitch_semitones": terminal_st,
                    "formant_preserved": True,
                },
            }
        )

    output_manifest = {
        "version": 1,
        "speaker": "F3-reference-prosody",
        "policy": {
            "identity_source": "owner recordings only",
            "reference_usage": "numeric tempo and terminal pitch-contour targets only",
            "third_party_audio_in_training": False,
            "tempo_target_chars_per_second": [6.90, 7.31, 7.71],
            "pause_target_seconds": 0.33,
            "validation": "original owner-voice clips only",
        },
        "source_manifest": str(args.source_manifest),
        "clips": output_clips,
    }
    output_path = args.output_root / "dataset_manifest.json"
    output_path.write_text(json.dumps(output_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    train = [item for item in output_clips if item["split"] == "train"]
    val = [item for item in output_clips if item["split"] == "val"]
    print(json.dumps({
        "manifest": str(output_path),
        "train_clips": len(train), "val_clips": len(val),
        "train_seconds": round(sum(item["duration_seconds"] for item in train), 3),
        "val_seconds": round(sum(item["duration_seconds"] for item in val), 3),
        "augmented_clips": sum(item["augmentation"] is not None for item in train),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
