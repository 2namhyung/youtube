from __future__ import annotations

import argparse
import hashlib
import json
import math
import subprocess
import time
from pathlib import Path

import numpy as np
from faster_whisper import WhisperModel


AUDIO_SUFFIXES = {".m4a", ".wav"}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run_json(command: list[str]) -> dict:
    result = subprocess.run(command, check=True, capture_output=True, text=True, encoding="utf-8")
    return json.loads(result.stdout)


def probe(path: Path) -> dict:
    payload = run_json([
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels,channel_layout,sample_fmt,bits_per_raw_sample:format=duration,size,bit_rate",
        "-of", "json", str(path),
    ])
    stream = payload["streams"][0]
    fmt = payload["format"]
    return {
        "codec": stream.get("codec_name"),
        "sampleRate": int(stream["sample_rate"]),
        "channels": int(stream["channels"]),
        "channelLayout": stream.get("channel_layout"),
        "sampleFormat": stream.get("sample_fmt"),
        "bitsPerRawSample": stream.get("bits_per_raw_sample") or None,
        "durationSeconds": round(float(fmt["duration"]), 6),
        "bytes": int(fmt["size"]),
        "bitRate": int(fmt["bit_rate"]) if fmt.get("bit_rate") else None,
    }


def decode_mono(path: Path, sample_rate: int = 24000) -> np.ndarray:
    result = subprocess.run([
        "ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0",
        "-ac", "1", "-ar", str(sample_rate), "-f", "f32le", "-",
    ], check=True, capture_output=True)
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def contiguous_runs(mask: np.ndarray) -> list[tuple[int, int]]:
    padded = np.pad(mask.astype(np.int8), (1, 1))
    edges = np.diff(padded)
    starts = np.flatnonzero(edges == 1)
    ends = np.flatnonzero(edges == -1)
    return list(zip(starts.tolist(), ends.tolist()))


def signal_metrics(samples: np.ndarray, sample_rate: int = 24000) -> dict:
    if samples.size == 0:
        raise RuntimeError("decoded audio is empty")
    peak = float(np.max(np.abs(samples)))
    rms = float(np.sqrt(np.mean(np.square(samples, dtype=np.float64))))
    frame_samples = round(sample_rate * 0.02)
    frame_count = samples.size // frame_samples
    framed = samples[: frame_count * frame_samples].reshape(frame_count, frame_samples)
    frame_rms = np.sqrt(np.mean(np.square(framed, dtype=np.float64), axis=1))
    silence_threshold = 10 ** (-42 / 20)
    silent = frame_rms < silence_threshold
    runs = contiguous_runs(silent)
    run_seconds = [((start * frame_samples) / sample_rate, (end * frame_samples) / sample_rate) for start, end in runs]
    long_runs = [(start, end) for start, end in run_seconds if end - start >= 0.08]
    duration = samples.size / sample_rate
    leading = long_runs[0][1] if long_runs and long_runs[0][0] == 0 else 0.0
    trailing = duration - long_runs[-1][0] if long_runs and abs(long_runs[-1][1] - frame_count * frame_samples / sample_rate) < 0.021 else 0.0
    internal = [end - start for start, end in long_runs if start > 0 and end < duration - 0.021]
    return {
        "analysisSampleRate": sample_rate,
        "peakDbfs": round(20 * math.log10(max(peak, 1e-12)), 3),
        "rmsDbfs": round(20 * math.log10(max(rms, 1e-12)), 3),
        "dcOffset": round(float(np.mean(samples, dtype=np.float64)), 8),
        "clippedSamples": int(np.count_nonzero(np.abs(samples) >= 0.999)),
        "silenceThresholdDbfs": -42,
        "silenceRatio": round(float(np.mean(silent)), 6),
        "speechActivityRatio": round(float(1 - np.mean(silent)), 6),
        "silenceRunsOver80ms": len(long_runs),
        "leadingSilenceSeconds": round(leading, 3),
        "trailingSilenceSeconds": round(trailing, 3),
        "maxInternalSilenceSeconds": round(max(internal, default=0.0), 3),
        "medianInternalSilenceSeconds": round(float(np.median(internal)), 3) if internal else 0.0,
        "noiseFloorProxyDbfs": round(20 * math.log10(max(float(np.percentile(frame_rms, 10)), 1e-12)), 3),
    }


def transcribe(model: WhisperModel, audio_path: Path) -> dict:
    started = time.perf_counter()
    segments, info = model.transcribe(
        str(audio_path), language="ko", beam_size=5, best_of=5, temperature=0.0,
        vad_filter=True, vad_parameters={"min_silence_duration_ms": 350, "speech_pad_ms": 120},
        word_timestamps=True, condition_on_previous_text=False,
    )
    serialized = []
    for segment in segments:
        serialized.append({
            "start": round(float(segment.start), 3),
            "end": round(float(segment.end), 3),
            "text": segment.text.strip(),
            "avgLogProbability": round(float(segment.avg_logprob), 6),
            "noSpeechProbability": round(float(segment.no_speech_prob), 6),
            "words": [
                {
                    "start": round(float(word.start), 3),
                    "end": round(float(word.end), 3),
                    "text": word.word.strip(),
                    "probability": round(float(word.probability), 6),
                }
                for word in (segment.words or [])
                if word.start is not None and word.end is not None and word.word.strip()
            ],
        })
    return {
        "language": info.language,
        "languageProbability": round(float(info.language_probability), 6),
        "durationSeconds": round(float(info.duration), 6),
        "generationSeconds": round(time.perf_counter() - started, 3),
        "transcript": " ".join(segment["text"] for segment in serialized).strip(),
        "segments": serialized,
    }


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--models", nargs="+", default=["small", "medium"])
    parser.add_argument("--device", default="cuda")
    parser.add_argument("--compute-type", default="float16")
    args = parser.parse_args()

    source = args.source.resolve()
    out = args.out.resolve()
    files = sorted((path for path in source.iterdir() if path.is_file()), key=lambda path: path.name.casefold())
    audio_files = [path for path in files if path.suffix.lower() in AUDIO_SUFFIXES]
    records: dict[str, dict] = {}

    for index, path in enumerate(files, 1):
        record = {
            "relativePath": path.relative_to(source.parent.parent.parent).as_posix(),
            "fileName": path.name,
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
            "ownerVoice": True,
            "thirdPartyAudio": False,
            "originalPreservedReadOnly": True,
        }
        if path in audio_files:
            record["media"] = probe(path)
            record["signal"] = signal_metrics(decode_mono(path))
            record["transcriptEvidence"] = {
                "status": "asr-diagnostic-only",
                "exactTranscriptClaimed": False,
                "reason": "No authoritative transcript sidecar was inferred from a filename.",
            }
        else:
            record["kind"] = "prosody-sidecar"
            try:
                record["sidecar"] = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                record["sidecarParseError"] = True
        records[path.name] = record
        print(f"inventory {index}/{len(files)} {path.name}", flush=True)

    asr_dir = out / "asr"
    for model_name in args.models:
        print(f"loading ASR {model_name}", flush=True)
        model = WhisperModel(model_name, device=args.device, compute_type=args.compute_type)
        for index, path in enumerate(audio_files, 1):
            output_path = asr_dir / f"{path.name}.{model_name}.json"
            payload = transcribe(model, path)
            payload.update({
                "schemaVersion": 1,
                "sourceFile": path.name,
                "sourceSha256": records[path.name]["sha256"],
                "model": model_name,
                "device": args.device,
                "computeType": args.compute_type,
                "diagnosticOnly": True,
            })
            write_json(output_path, payload)
            records[path.name].setdefault("asr", {})[model_name] = {
                "artifact": output_path.relative_to(out).as_posix(),
                "artifactSha256": sha256(output_path),
                "transcript": payload["transcript"],
                "languageProbability": payload["languageProbability"],
                "generationSeconds": payload["generationSeconds"],
            }
            print(f"ASR {model_name} {index}/{len(audio_files)} {path.name}", flush=True)
        del model

    ledger = {
        "schemaVersion": 1,
        "ledgerId": "owner-voice-v1-corpus-audit-20260808",
        "status": "inventory-complete-pending-admission-decision",
        "sourceRoot": "03-script-voice/reference-audio/user",
        "sourcePolicy": {
            "ownerAuthorization": "User explicitly authorized these owner recordings for local voice model, TTS, and video use on 2026-08-08.",
            "ownerVoice": True,
            "thirdPartyAudio": False,
            "originalsReadOnly": True,
            "exactTranscriptPolicy": "ASR is diagnostic. Exact transcript claims require an authoritative script/sidecar plus alignment evidence.",
        },
        "auditRuntime": {
            "asrModels": args.models,
            "device": args.device,
            "computeType": args.compute_type,
            "signalAnalysisSampleRate": 24000,
        },
        "counts": {"totalFiles": len(files), "audioFiles": len(audio_files), "sidecarFiles": len(files) - len(audio_files)},
        "files": list(records.values()),
    }
    write_json(out / "corpus-audit.json", ledger)
    print(json.dumps({"audit": str(out / "corpus-audit.json"), "files": len(files), "audio": len(audio_files)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
