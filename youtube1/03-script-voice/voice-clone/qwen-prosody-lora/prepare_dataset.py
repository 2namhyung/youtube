"""Prepare an owned JSONL with Qwen3-TTS 12 Hz codec codes.

The input is read-only. The output path is required to stay under this pilot's
directory so existing F4/source assets cannot be overwritten accidentally.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BATCH_SIZE = 32
ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor"
if VENDOR.is_dir():
    sys.path.insert(0, str(VENDOR))


def _owned(path: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(ROOT)
    except ValueError as exc:
        raise ValueError(f"output must stay under {ROOT}: {resolved}") from exc
    return resolved


def prepare(input_jsonl: Path, output_jsonl: Path, tokenizer_model: str, device: str) -> int:
    # Import lazily so unit/syntax checks do not require a GPU environment.
    from qwen_tts import Qwen3TTSTokenizer

    rows = [json.loads(line) for line in input_jsonl.read_text(encoding="utf-8").splitlines() if line.strip()]
    required = {"audio", "text", "ref_audio"}
    for index, row in enumerate(rows):
        missing = required - set(row)
        if missing:
            raise ValueError(f"row {index} missing fields: {sorted(missing)}")

    tokenizer_path = Path(tokenizer_model)
    if not tokenizer_path.is_dir():
        raise ValueError("tokenizer-model must be a local pinned speech_tokenizer directory")
    tokenizer = Qwen3TTSTokenizer.from_pretrained(str(tokenizer_path), device_map=device)
    output_jsonl.parent.mkdir(parents=True, exist_ok=True)
    with output_jsonl.open("w", encoding="utf-8") as out:
        for start in range(0, len(rows), BATCH_SIZE):
            chunk = rows[start : start + BATCH_SIZE]
            encoded = tokenizer.encode([row["audio"] for row in chunk])
            for row, codes in zip(chunk, encoded.audio_codes):
                derived = dict(row)
                derived["audio_codes"] = codes.cpu().tolist()
                out.write(json.dumps(derived, ensure_ascii=False) + "\n")
    return len(rows)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-jsonl", type=Path, required=True)
    parser.add_argument("--output-jsonl", type=Path, default=ROOT / "derived" / "train_with_codes.jsonl")
    parser.add_argument("--tokenizer-model", required=True)
    parser.add_argument("--device", default="cuda:0")
    args = parser.parse_args()
    count = prepare(args.input_jsonl, _owned(args.output_jsonl), args.tokenizer_model, args.device)
    print(json.dumps({"rows": count, "output": str(_owned(args.output_jsonl))}))


if __name__ == "__main__":
    main()
