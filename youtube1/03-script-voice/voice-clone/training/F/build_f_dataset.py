import argparse
import hashlib
import json
import re
import subprocess
import unicodedata
from pathlib import Path

import soundfile as sf


def normalized(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    return "".join(ch for ch in text if ch.isalnum())


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest().upper()


def overlapping_text(segment: dict, other_segments: list[dict]) -> str:
    parts = []
    for other in other_segments:
        overlap = min(segment["end"], other["end"]) - max(
            segment["start"], other["start"]
        )
        if overlap > 0.15:
            parts.append(other["text"])
    return " ".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", type=Path, required=True)
    parser.add_argument("--asr", type=Path, required=True)
    parser.add_argument("--asr-consensus", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.output.exists() and any(args.output.iterdir()):
        raise SystemExit(f"Refusing to overwrite non-empty dataset: {args.output}")

    # This region is independently recognized the same way by both ASR models but is
    # semantically self-contradictory (피해자/가해자), matching the prior profile warning.
    manual_exclusions = {
        "04_tension.full": [(2.4, 12.7, "subject-word ambiguity")],
    }

    accepted_by_source: dict[str, list[dict]] = {}
    excluded: list[dict] = []
    source_records = []

    for source in sorted(args.sources.glob("*.wav")):
        primary = json.loads(
            (args.asr / f"{source.stem}.asr.json").read_text(encoding="utf-8")
        )
        consensus = json.loads(
            (args.asr_consensus / f"{source.stem}.asr.json").read_text(
                encoding="utf-8"
            )
        )
        info = sf.info(source)
        source_records.append(
            {
                "path": str(source.resolve()),
                "sha256": sha256(source),
                "duration_seconds": info.duration,
                "sample_rate": info.samplerate,
                "channels": info.channels,
                "subtype": info.subtype,
            }
        )

        candidates = []
        for segment in primary["segments"]:
            other_text = overlapping_text(segment, consensus["segments"])
            reasons = []
            primary_normalized = normalized(segment["text"])
            consensus_normalized = normalized(other_text)
            if (
                primary_normalized not in consensus_normalized
                and consensus_normalized not in primary_normalized
            ):
                reasons.append("large-v3/large-v3-turbo transcript disagreement")
            probabilities = [
                word["probability"]
                for word in segment["words"]
                if word["word"].strip()
            ]
            if segment["avg_logprob"] < -0.35:
                reasons.append("low segment log probability")
            if probabilities and sum(probabilities) / len(probabilities) < 0.94:
                reasons.append("low mean word probability")
            for start, end, reason in manual_exclusions.get(source.stem, []):
                if min(segment["end"], end) - max(segment["start"], start) > 0:
                    reasons.append(reason)
            record = {
                "source": source.name,
                "start": segment["start"],
                "end": segment["end"],
                "transcript": segment["text"],
                "consensus_transcript": other_text,
                "avg_logprob": segment["avg_logprob"],
                "mean_word_probability": (
                    sum(probabilities) / len(probabilities) if probabilities else None
                ),
                "min_word_probability": min(probabilities) if probabilities else None,
            }
            if reasons:
                record["reasons"] = sorted(set(reasons))
                excluded.append(record)
            else:
                candidates.append(record)

        # Join only ASR chunks separated by less than 0.4 s, where splitting would
        # cut a continuous sentence/clause instead of a natural silence.
        grouped = []
        for item in candidates:
            if grouped and item["start"] - grouped[-1]["end"] < 0.4:
                previous = grouped[-1]
                previous["end"] = item["end"]
                previous["transcript"] = (
                    previous["transcript"].rstrip() + " " + item["transcript"].lstrip()
                )
                previous["avg_logprob"] = min(
                    previous["avg_logprob"], item["avg_logprob"]
                )
                previous["mean_word_probability"] = min(
                    previous["mean_word_probability"], item["mean_word_probability"]
                )
                previous["min_word_probability"] = min(
                    previous["min_word_probability"], item["min_word_probability"]
                )
            else:
                grouped.append(dict(item))
        accepted_by_source[source.stem] = grouped

    # One clip per recording is reserved for validation (middle accepted clip),
    # ensuring all six delivery styles are represented without utterance leakage.
    validation_ids = {
        (source_stem, len(items) // 2)
        for source_stem, items in accepted_by_source.items()
    }
    clip_records = []
    for source_stem, items in accepted_by_source.items():
        source = args.sources / f"{source_stem}.wav"
        short_style = source_stem.split("_", 1)[1].split(".", 1)[0]
        for index, item in enumerate(items):
            split = "val" if (source_stem, index) in validation_ids else "train"
            speaker_dir = args.output / split / "F"
            speaker_dir.mkdir(parents=True, exist_ok=True)
            start = max(0.0, item["start"] - 0.12)
            end = item["end"] + 0.16
            clip_id = f"F_{short_style}_{index + 1:03d}_{start:07.3f}_{end:07.3f}"
            audio_out = speaker_dir / f"{clip_id}.wav"
            lab_out = speaker_dir / f"{clip_id}.lab"
            subprocess.run(
                [
                    "ffmpeg",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-ss",
                    f"{start:.6f}",
                    "-to",
                    f"{end:.6f}",
                    "-i",
                    str(source),
                    "-map_metadata",
                    "-1",
                    "-acodec",
                    "pcm_s16le",
                    "-y",
                    str(audio_out),
                ],
                check=True,
            )
            lab_out.write_text(item["transcript"].strip(), encoding="utf-8")
            clip_info = sf.info(audio_out)
            clip_records.append(
                {
                    "id": clip_id,
                    "split": split,
                    "source": source.name,
                    "source_start": start,
                    "source_end": end,
                    "duration_seconds": clip_info.duration,
                    "audio": str(audio_out.resolve()),
                    "lab": str(lab_out.resolve()),
                    "transcript": item["transcript"].strip(),
                    "avg_logprob": item["avg_logprob"],
                    "mean_word_probability": item["mean_word_probability"],
                    "min_word_probability": item["min_word_probability"],
                    "audio_sha256": sha256(audio_out),
                    "lab_sha256": sha256(lab_out),
                }
            )

    manifest = {
        "version": 1,
        "speaker": "F",
        "policy": {
            "primary_asr": "Systran/faster-whisper-large-v3, CUDA float16, beam 5",
            "consensus_asr": "mobiuslabsgmbh/faster-whisper-large-v3-turbo, CUDA float16, beam 5",
            "acceptance": "normalized transcript consensus, segment avg_logprob >= -0.35, mean word probability >= 0.94",
            "manual_exclusion": "04_tension 2.4-12.7 s subject-word ambiguity; transcript not corrected by inference",
            "audio_processing": "sentence-aligned trim only; PCM16/24 kHz/mono preserved; no denoise, dynamics, gain, or loudness normalization",
        },
        "sources": source_records,
        "clips": clip_records,
        "excluded_segments": excluded,
    }
    (args.output / "dataset_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        f"Created {len(clip_records)} clips "
        f"({sum(c['split'] == 'train' for c in clip_records)} train, "
        f"{sum(c['split'] == 'val' for c in clip_records)} val); "
        f"excluded {len(excluded)} uncertain ASR segments"
    )


if __name__ == "__main__":
    main()
