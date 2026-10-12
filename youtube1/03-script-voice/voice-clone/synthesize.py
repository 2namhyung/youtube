from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
COSYVOICE_ROOT = ROOT / "vendor" / "CosyVoice"
MATCHA_ROOT = COSYVOICE_ROOT / "third_party" / "Matcha-TTS"

# OmniVoice's Windows guidance recommends eager mode on sub-16 GB GPUs.
os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
os.environ.setdefault("HF_HOME", str(ROOT / "cache" / "huggingface"))
os.environ.setdefault("MODELSCOPE_CACHE", str(ROOT / "cache" / "modelscope"))

sys.path.insert(0, str(COSYVOICE_ROOT))
sys.path.insert(0, str(MATCHA_ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate local-only Korean zero-shot speech with CosyVoice3."
    )
    parser.add_argument("--text", help="Text to synthesize.")
    parser.add_argument("--text-file", type=Path, help="UTF-8 text file to synthesize.")
    parser.add_argument("--style", default="neutral")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=ROOT / "models" / "Fun-CosyVoice3-0.5B",
    )
    parser.add_argument("--manifest", type=Path, default=ROOT / "manifest.json")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument(
        "--fp32",
        action="store_true",
        help="Disable fp16. fp16 is the default when CUDA is available.",
    )
    return parser.parse_args()


def load_text(args: argparse.Namespace) -> str:
    if bool(args.text) == bool(args.text_file):
        raise SystemExit("provide exactly one of --text or --text-file")
    text = args.text if args.text else args.text_file.read_text(encoding="utf-8")
    text = text.strip()
    if not text:
        raise SystemExit("synthesis text is empty")
    return text


def main() -> None:
    args = parse_args()
    text = load_text(args)
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    style = manifest["styles"].get(args.style)
    if not style:
        choices = ", ".join(sorted(manifest["styles"]))
        raise SystemExit(f"unknown style {args.style!r}; choose one of: {choices}")
    if not style.get("promptAudio") or not style.get("promptText"):
        raise SystemExit(
            f"style {args.style!r} has no transcript-aligned prompt; "
            "use neutral, hook, or solution"
        )

    prompt_audio = (manifest_path.parent / style["promptAudio"]).resolve()
    if not prompt_audio.is_file():
        raise SystemExit(f"prompt audio not found: {prompt_audio}")
    model_dir = args.model_dir.resolve()
    if not (model_dir / "cosyvoice3.yaml").is_file():
        raise SystemExit(
            f"CosyVoice3 model not found at {model_dir}; run download_model.py first"
        )
    from model_lock import verify_model

    model_lock = verify_model(model_dir)

    import torch
    import torchaudio
    from cosyvoice.cli.cosyvoice import AutoModel

    use_fp16 = torch.cuda.is_available() and not args.fp32
    model = AutoModel(
        model_dir=str(model_dir),
        load_trt=False,
        load_vllm=False,
        fp16=use_fp16,
    )
    prompt_text = (
        "You are a helpful assistant.<|endofprompt|>" + style["promptText"]
    )
    chunks = [
        item["tts_speech"].detach().cpu()
        for item in model.inference_zero_shot(
            text,
            prompt_text,
            str(prompt_audio),
            stream=False,
            speed=args.speed,
        )
    ]
    if not chunks:
        raise RuntimeError("CosyVoice returned no audio")

    speech = torch.cat(chunks, dim=1)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    torchaudio.save(str(args.output), speech, model.sample_rate)
    seconds = speech.shape[1] / model.sample_rate
    device = "cuda-fp16" if use_fp16 else "cpu/fp32"
    print(
        json.dumps(
            {
                "output": str(args.output.resolve()),
                "style": args.style,
                "durationSeconds": round(seconds, 3),
                "sampleRate": model.sample_rate,
                "device": device,
                "modelId": model_lock["repository"],
                "modelRevision": model_lock["revision"],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
