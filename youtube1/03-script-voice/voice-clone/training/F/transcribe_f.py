import argparse
import json
from pathlib import Path

from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--model", default="large-v3")
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)
    model = WhisperModel(
        args.model,
        device="cuda",
        compute_type="float16",
        download_root=str(args.output / "model-cache"),
    )

    for audio_path in sorted(args.input.glob("*.wav")):
        segments, info = model.transcribe(
            str(audio_path),
            language="ko",
            beam_size=5,
            best_of=5,
            temperature=0.0,
            word_timestamps=True,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 350, "speech_pad_ms": 120},
            condition_on_previous_text=False,
        )
        serialized = []
        for segment in segments:
            serialized.append(
                {
                    "id": segment.id,
                    "start": segment.start,
                    "end": segment.end,
                    "text": segment.text.strip(),
                    "avg_logprob": segment.avg_logprob,
                    "no_speech_prob": segment.no_speech_prob,
                    "compression_ratio": segment.compression_ratio,
                    "words": [
                        {
                            "start": word.start,
                            "end": word.end,
                            "word": word.word,
                            "probability": word.probability,
                        }
                        for word in (segment.words or [])
                    ],
                }
            )
        result = {
            "source": str(audio_path.resolve()),
            "model": args.model,
            "language": info.language,
            "language_probability": info.language_probability,
            "duration": info.duration,
            "duration_after_vad": info.duration_after_vad,
            "segments": serialized,
        }
        out_path = args.output / f"{audio_path.stem}.asr.json"
        out_path.write_text(
            json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"{audio_path.name}: {len(serialized)} segments -> {out_path}")


if __name__ == "__main__":
    main()
