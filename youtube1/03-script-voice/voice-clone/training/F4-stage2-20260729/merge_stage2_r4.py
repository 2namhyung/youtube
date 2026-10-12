"""CPU-merge an r4 stage-2 adapter into the already merged stage-1 base."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from copy import deepcopy
from pathlib import Path

import torch

from fish_speech.models.text2semantic.llama import BaseTransformer
from fish_speech.models.text2semantic.lora import LoraConfig


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", type=Path, required=True)
    parser.add_argument("--lora", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit(f"refusing to overwrite {args.output}")
    config = LoraConfig(r=4, lora_alpha=8, lora_dropout=0.01)
    model = BaseTransformer.from_pretrained(path=args.base, load_weights=True, lora_config=config)
    before = {key: value.detach().cpu().clone() for key, value in model.state_dict().items() if "lora" not in key}
    lora = torch.load(args.lora, map_location="cpu", weights_only=False)
    lora = lora.get("state_dict", lora)
    if any(key.startswith("model.") for key in lora):
        lora = {key.removeprefix("model."): value for key, value in lora.items() if key.startswith("model.")}
    combined = model.state_dict() | lora
    model.load_state_dict(combined, strict=True)
    model.eval()
    model.save_pretrained(args.output, drop_lora=True)
    for filename in ("config.json", "special_tokens.json", "tokenizer.tiktoken"):
        if not (args.output / filename).exists():
            shutil.copy2(args.base / filename, args.output / filename)
    after = torch.load(args.output / "model.pth", map_location="cpu", weights_only=True)
    if set(before) != set(after):
        raise RuntimeError("merged key set differs from stacked base")
    shape_match = all(before[key].shape == after[key].shape for key in before)
    changed = sum(not torch.equal(before[key], after[key]) for key in before)
    if not shape_match or changed == 0:
        raise RuntimeError(f"invalid merge: shape_match={shape_match}, changed={changed}")
    evidence = {
        "stage1_stacked_base": str(args.base),
        "stage1_stacked_model_sha256": sha256(args.base / "model.pth"),
        "stage2_lora_checkpoint": str(args.lora), "stage2_lora_sha256": sha256(args.lora),
        "adapter": {"rank": 4, "alpha": 8, "dropout": 0.01},
        "output": str(args.output), "output_model_sha256": sha256(args.output / "model.pth"),
        "tensor_key_count": len(after), "changed_tensor_count": changed,
        "shape_match": shape_match, "cpu_merge": True,
    }
    (args.output / "stage2-merge-provenance.json").write_text(
        json.dumps(evidence, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(evidence, ensure_ascii=False))


if __name__ == "__main__":
    main()
