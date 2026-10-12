"""Fail-fast unsupported Qwen3-TTS 0.6B LoRA probe and tiny overfit gate."""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata as metadata
import json
import math
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
VENDOR = ROOT / "vendor"
if VENDOR.is_dir():
    sys.path.insert(0, str(VENDOR))

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")
os.environ.setdefault("HF_DATASETS_OFFLINE", "1")

import torch
from peft import LoraConfig, get_peft_model
from torch.optim import AdamW
from torch.utils.data import DataLoader
from transformers import AutoConfig

from dataset import PilotDataset
from qwen_tts.inference.qwen3_tts_model import Qwen3TTSModel

SOURCE_COMMIT = "022e286b98fbec7e1e916cb940cdf532cd9f488e"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
MODEL_REVISION = "5d83992436eae1d760afd27aff78a71d676296fc"
TARGET_RE = re.compile(r"^model\.layers\.\d+\.self_attn\.(q_proj|k_proj|v_proj|o_proj)$")
MIB = 1024 * 1024


class PilotStop(RuntimeError):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def gpu_snapshot() -> dict[str, Any]:
    command = [
        "nvidia-smi", "--query-gpu=name,memory.total,memory.used,memory.free,temperature.gpu",
        "--format=csv,noheader,nounits",
    ]
    row = subprocess.check_output(command, text=True, timeout=10).strip().splitlines()[0]
    name, total, used, free, temp = [part.strip() for part in row.split(",")]
    return {"name": name, "total_mib": int(total), "used_mib": int(used), "free_mib": int(free), "temperature_c": int(temp)}


def package_version(name: str) -> str:
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return "missing"


def assert_vendor_pin() -> dict[str, Any]:
    qwen_path = Path(sys.modules[Qwen3TTSModel.__module__].__file__).resolve()
    if VENDOR.resolve() not in qwen_path.parents:
        raise PilotStop(f"qwen_tts is not loaded from isolated vendor: {qwen_path}")
    distributions = list(metadata.distributions(path=[str(VENDOR)]))
    qwen_dist = next((dist for dist in distributions if dist.metadata["Name"].lower() == "qwen-tts"), None)
    if qwen_dist is None:
        raise PilotStop("isolated qwen-tts distribution metadata missing")
    direct = qwen_dist.read_text("direct_url.json")
    direct_json = json.loads(direct) if direct else {}
    commit = direct_json.get("vcs_info", {}).get("commit_id")
    if commit != SOURCE_COMMIT:
        raise PilotStop(f"qwen source commit mismatch: {commit!r}")
    return {"module_path": str(qwen_path), "source_commit": commit, "version": qwen_dist.version}


def local_model_path() -> Path:
    hub = Path.home() / ".cache" / "huggingface" / "hub"
    snapshot = hub / "models--Qwen--Qwen3-TTS-12Hz-0.6B-Base" / "snapshots" / MODEL_REVISION
    required = [snapshot / "config.json", snapshot / "model.safetensors", snapshot / "speech_tokenizer" / "model.safetensors"]
    if not all(path.is_file() for path in required):
        raise PilotStop(f"pinned model snapshot is incomplete: {snapshot}")
    return snapshot


def watchdog(config: dict[str, Any], phase: str, require_start_free: bool = False) -> dict[str, Any]:
    snap = gpu_snapshot()
    limits = config["runtime"]
    if snap["temperature_c"] >= limits["max_gpu_temperature_c"]:
        raise PilotStop(f"{phase}: GPU temperature {snap['temperature_c']}C reached hard stop")
    if snap["used_mib"] > limits["max_used_vram_mib"]:
        raise PilotStop(f"{phase}: physical VRAM used {snap['used_mib']} MiB exceeds cap")
    if require_start_free and snap["free_mib"] < limits["min_free_vram_mib"]:
        raise PilotStop(f"{phase}: only {snap['free_mib']} MiB free; need {limits['min_free_vram_mib']}")
    if torch.cuda.is_available() and torch.cuda.max_memory_reserved() / MIB > limits["max_peak_reserved_mib"]:
        raise PilotStop(f"{phase}: torch peak reserved VRAM exceeds cap")
    return snap


def load_and_wrap(config: dict[str, Any]) -> tuple[Any, Any, list[str]]:
    snapshot = local_model_path()
    loaded = Qwen3TTSModel.from_pretrained(
        str(snapshot), device_map="cuda:0", dtype=torch.bfloat16,
        attn_implementation="sdpa", local_files_only=True,
    )
    core = loaded.model
    if core.config.tts_model_size != "0b6" or core.config.tts_model_type != "base":
        raise PilotStop("loaded checkpoint is not canonical 0.6B Base")
    if core.config.talker_config.text_hidden_size != 2048 or core.config.talker_config.hidden_size != 1024:
        raise PilotStop("unexpected 0.6B text/talker dimensions")

    core.requires_grad_(False)
    talker = core.talker
    targets = sorted(name for name, module in talker.named_modules() if TARGET_RE.fullmatch(name) and isinstance(module, torch.nn.Linear))
    expected = 28 * 4
    if len(targets) != expected:
        raise PilotStop(f"expected {expected} main-talker attention targets, found {len(targets)}")
    lora = config["lora"]
    peft_config = LoraConfig(
        r=lora["rank"], lora_alpha=lora["alpha"], lora_dropout=lora["dropout"],
        bias="none", target_modules=TARGET_RE.pattern, task_type=None,
    )
    core.talker = get_peft_model(talker, peft_config)
    base_talker = core.talker.get_base_model()
    base_talker.config.use_cache = False
    base_talker.code_predictor.config.use_cache = False
    if config["runtime"]["gradient_checkpointing"]:
        base_talker.gradient_checkpointing_enable(gradient_checkpointing_kwargs={"use_reentrant": False})
    trainable = [(name, parameter) for name, parameter in core.named_parameters() if parameter.requires_grad]
    if len(trainable) != expected * 2:
        extras = [name for name, _ in trainable if not re.search(r"\.model\.layers\.\d+\.self_attn\.(q_proj|k_proj|v_proj|o_proj)\.", name)]
        raise PilotStop(f"expected {expected * 2} LoRA tensors, found {len(trainable)}; non-main examples={extras[:8]}")
    unexpected = [name for name, _ in trainable if "lora_A" not in name and "lora_B" not in name]
    if unexpected:
        raise PilotStop(f"unexpected trainable base parameters: {unexpected[:3]}")
    return loaded, base_talker, targets


def loss_for_batch(core: Any, talker: Any, batch: dict[str, torch.Tensor]) -> torch.Tensor:
    device = next(core.parameters()).device
    batch = {name: value.to(device) for name, value in batch.items()}
    with torch.no_grad():
        speaker = core.speaker_encoder(batch["ref_mels"].to(dtype=next(core.parameters()).dtype)).detach()
    text_ids = batch["input_ids"][:, :, 0]
    codec_ids_0 = batch["input_ids"][:, :, 1]
    # Mandatory 0.6B fix: inference projects 2048-wide text embeddings to 1024.
    text_embed = talker.text_projection(talker.model.text_embedding(text_ids))
    if text_embed.shape[-1] != talker.model.codec_embedding.embedding_dim:
        raise PilotStop(f"projected text/codec width mismatch: {text_embed.shape[-1]}")
    inputs = text_embed * batch["text_embedding_mask"]
    codec_embed = talker.model.codec_embedding(codec_ids_0) * batch["codec_embedding_mask"]
    codec_embed[:, 6, :] = speaker
    inputs = inputs + codec_embed
    for index in range(1, 16):
        extra = talker.code_predictor.get_input_embeddings()[index - 1](batch["codec_ids"][:, :, index])
        inputs = inputs + extra * batch["codec_mask"].unsqueeze(-1)
    outputs = talker(
        inputs_embeds=inputs[:, :-1], attention_mask=batch["attention_mask"][:, :-1],
        labels=batch["codec_0_labels"][:, 1:], output_hidden_states=True, use_cache=False,
    )
    hidden = outputs.hidden_states[0][-1]
    selected_hidden = hidden[batch["codec_mask"][:, :-1]]
    selected_codes = batch["codec_ids"][batch["codec_mask"]]
    _, sub_loss = talker.forward_sub_talker_finetune(selected_codes, selected_hidden)
    loss = outputs.loss + 0.3 * sub_loss
    if not torch.isfinite(loss):
        raise PilotStop(f"non-finite loss: {loss.item()}")
    return loss


def make_loader(jsonl: Path, loaded: Any, config: dict[str, Any]) -> DataLoader:
    dataset = PilotDataset(jsonl, loaded.processor, loaded.model.config, config["runtime"]["max_sequence_length"])
    return DataLoader(dataset, batch_size=1, shuffle=False, collate_fn=dataset.collate_fn)


def run_probe(jsonl: Path, config: dict[str, Any], report: dict[str, Any]) -> None:
    watchdog(config, "preload", require_start_free=True)
    torch.cuda.reset_peak_memory_stats()
    loaded, talker, targets = load_and_wrap(config)
    loader = make_loader(jsonl, loaded, config)
    batch = next(iter(loader))
    loss = loss_for_batch(loaded.model, talker, batch)
    loss.backward()  # Intentionally no optimizer and no optimizer.step().
    grads = [parameter.grad.detach().float() for parameter in loaded.model.parameters() if parameter.requires_grad and parameter.grad is not None]
    if not grads or any(not torch.isfinite(grad).all() for grad in grads):
        raise PilotStop("missing or non-finite LoRA gradients")
    grad_norm = math.sqrt(sum(float(grad.square().sum()) for grad in grads))
    if grad_norm == 0.0:
        raise PilotStop("zero LoRA gradient norm")
    post = watchdog(config, "post-backward")
    report["probe"] = {
        "gate_passed": True, "optimizer_steps": 0, "loss": float(loss.detach()), "grad_norm": grad_norm,
        "target_module_count": len(targets), "target_modules": targets,
        "trainable_parameters": sum(parameter.numel() for parameter in loaded.model.parameters() if parameter.requires_grad),
        "torch_peak_allocated_mib": round(torch.cuda.max_memory_allocated() / MIB, 2),
        "torch_peak_reserved_mib": round(torch.cuda.max_memory_reserved() / MIB, 2), "gpu": post,
    }


def run_overfit(jsonl: Path, config: dict[str, Any], report: dict[str, Any]) -> None:
    prior = json.loads((ROOT / "outputs" / "probe_report.json").read_text(encoding="utf-8"))
    if not prior.get("probe", {}).get("gate_passed"):
        raise PilotStop("overfit gate requires a passing persisted probe")
    watchdog(config, "overfit-preload", require_start_free=True)
    torch.cuda.reset_peak_memory_stats()
    loaded, talker, targets = load_and_wrap(config)
    batches = list(make_loader(jsonl, loaded, config))
    parameters = [parameter for parameter in loaded.model.parameters() if parameter.requires_grad]
    optimizer = AdamW(parameters, lr=1e-5, weight_decay=0.0)
    accumulation = config["runtime"]["gradient_accumulation_steps"]
    steps = config["gate"]["overfit_steps"]
    loaded.model.eval()
    with torch.no_grad():
        pre_update_eval = [float(loss_for_batch(loaded.model, talker, batch)) for batch in batches]
    loaded.model.train()
    losses = []
    optimizer.zero_grad(set_to_none=True)
    for step in range(steps):
        watchdog(config, f"overfit-step-{step}-start")
        loss = loss_for_batch(loaded.model, talker, batches[step % len(batches)])
        (loss / accumulation).backward()
        losses.append(float(loss.detach()))
        if (step + 1) % accumulation == 0:
            torch.nn.utils.clip_grad_norm_(parameters, 1.0)
            optimizer.step()
            optimizer.zero_grad(set_to_none=True)
    optimizer_steps = steps // accumulation
    loaded.model.eval()
    with torch.no_grad():
        post_update_eval = [float(loss_for_batch(loaded.model, talker, batch)) for batch in batches]
    post = watchdog(config, "overfit-complete")
    pre_mean = sum(pre_update_eval) / len(pre_update_eval)
    post_mean = sum(post_update_eval) / len(post_update_eval)
    passed = optimizer_steps >= 1 and all(math.isfinite(value) for value in losses + post_update_eval) and post_mean < pre_mean
    report["overfit_gate"] = {
        "gate_passed": passed, "micro_steps": steps, "gradient_accumulation_steps": accumulation,
        "optimizer_steps": optimizer_steps, "train_losses": losses, "pre_update_eval_losses": pre_update_eval,
        "post_update_eval_losses": post_update_eval, "pre_update_eval_mean": pre_mean, "post_update_eval_mean": post_mean,
        "learning_rate": 1e-5,
        "target_module_count": len(targets), "torch_peak_reserved_mib": round(torch.cuda.max_memory_reserved() / MIB, 2),
        "gpu": post, "adapter_saved": False,
    }
    if not passed:
        raise PilotStop("bounded overfit acceptance gate failed")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group(required=True)
    modes.add_argument("--probe", action="store_true")
    modes.add_argument("--run-overfit-gate", action="store_true")
    parser.add_argument("--train-jsonl", type=Path, required=True)
    args = parser.parse_args()
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    outputs = ROOT / "outputs"
    outputs.mkdir(parents=True, exist_ok=True)
    report: dict[str, Any] = {
        "status": "running", "support": "unsupported-experimental", "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "command": "probe" if args.probe else "overfit-gate", "source": {"commit": SOURCE_COMMIT, "model": MODEL_ID, "revision": MODEL_REVISION},
        "versions": {name: package_version(name) for name in ["qwen-tts", "peft", "torch", "transformers", "accelerate", "librosa", "soundfile", "safetensors"]},
    }
    try:
        if not torch.cuda.is_available() or not torch.cuda.is_bf16_supported():
            raise PilotStop("CUDA with native BF16 support is required")
        report["qwen_source"] = assert_vendor_pin()
        snapshot = local_model_path()
        report["inputs"] = {
            "train_jsonl": str(args.train_jsonl.resolve()), "train_jsonl_sha256": sha256(args.train_jsonl),
            "model_config_sha256": sha256(snapshot / "config.json"), "model_weights_sha256": sha256(snapshot / "model.safetensors"),
        }
        if args.probe:
            run_probe(args.train_jsonl, config, report)
        else:
            run_overfit(args.train_jsonl, config, report)
        report["status"] = "pass"
    except Exception as exc:
        report["status"] = "blocked"
        report["blocker"] = {"type": type(exc).__name__, "message": str(exc)}
    finally:
        report["finished_utc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        (outputs / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if args.probe:
            (outputs / "probe_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": report["status"], "report": str(outputs / "report.json"), "blocker": report.get("blocker")}))
    if report["status"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
