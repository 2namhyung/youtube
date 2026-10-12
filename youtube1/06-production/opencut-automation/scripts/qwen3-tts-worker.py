#!/usr/bin/env python3
"""Persistent Qwen3-TTS worker used by the canonical narration provider.

The worker deliberately has no fallback path: startup requires CUDA and the
locked Base model, and every request is deterministic for its supplied seed.
"""
import argparse
import hashlib
import json
import sys
import os
import subprocess
import threading
import traceback
import time
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

DEFAULT_MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
MODEL_LOCKS = {
    DEFAULT_MODEL_ID: {
        "revision": "5d83992436eae1d760afd27aff78a71d676296fc",
        "size": "0b6",
    },
    "Qwen/Qwen3-TTS-12Hz-1.7B-Base": {
        "revision": "fd4b254389122332181a7c3db7f27e918eec64e3",
        "size": "1b7",
    },
}
DTYPE = torch.bfloat16
MAX_TEMPERATURE = 0.95
START_MAX_GPU_TEMP_C = 52
HARD_MAX_GPU_TEMP_C = 74


def reply(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def gpu_temperature():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
            check=True, capture_output=True, text=True, timeout=5,
        )
        return max(float(value.strip()) for value in result.stdout.splitlines() if value.strip())
    except Exception as exc:
        raise RuntimeError(f"unable to verify GPU temperature: {exc}") from exc


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference-audio")
    parser.add_argument("--reference-text")
    parser.add_argument("--reference-sha256")
    parser.add_argument("--prompt-style", required=True)
    parser.add_argument("--prompt-bank-manifest")
    parser.add_argument("--prompt-bank-sha256")
    parser.add_argument("--prompt-styles")
    parser.add_argument("--device", default="cuda:0")
    parser.add_argument("--model", default=DEFAULT_MODEL_ID)
    parser.add_argument("--model-revision")
    parser.add_argument("--model-local-path")
    parser.add_argument("--attention-implementation", choices=("sdpa", "flash_attention_2"), default="sdpa")
    args = parser.parse_args()
    model_lock = MODEL_LOCKS.get(args.model)
    if model_lock is None:
        raise RuntimeError(f"model is not in the locked Base allowlist: {args.model}")
    model_revision = args.model_revision or model_lock["revision"]
    if model_revision != model_lock["revision"]:
        raise RuntimeError(f"model revision mismatch for {args.model}")
    if args.attention_implementation == "flash_attention_2":
        try:
            import flash_attn  # noqa: F401
        except ImportError as exc:
            raise RuntimeError("flash_attention_2 was requested but flash-attn is not installed") from exc
    model_source = str(Path(args.model_local_path).resolve()) if args.model_local_path else args.model
    if args.model_local_path and not Path(model_source).is_dir():
        raise RuntimeError(f"local model path is missing: {model_source}")
    prompt_sources = {}
    prompt_bank_sha256 = None
    if args.prompt_style == "auto":
        if not args.prompt_bank_manifest or not args.prompt_bank_sha256 or not args.prompt_styles:
            raise RuntimeError("auto prompt mode requires locked prompt bank manifest, SHA-256 and styles")
        bank_path = Path(args.prompt_bank_manifest).resolve()
        prompt_bank_sha256 = hashlib.sha256(bank_path.read_bytes()).hexdigest()
        if prompt_bank_sha256 != args.prompt_bank_sha256.lower():
            raise RuntimeError(
                f"prompt bank SHA-256 mismatch: expected {args.prompt_bank_sha256.lower()}, "
                f"received {prompt_bank_sha256}"
            )
        bank = json.loads(bank_path.read_text(encoding="utf-8"))
        if bank.get("status") != "validation-passed" or bank.get("productionEligible") is not True or bank.get("ownerVoice") is not True:
            raise RuntimeError("prompt bank is not validation-passed production eligible")
        bank_model = bank.get("model") or {}
        if bank_model.get("id") != args.model or bank_model.get("revision") != model_revision or bank_model.get("precision") != "bf16" or bank_model.get("loraAllowed") is not False or bank_model.get("adapterAllowed") is not False or bank_model.get("fallbackAllowed") is not False:
            raise RuntimeError("prompt bank violates locked Base/BF16/no-LoRA invariant")
        requested_styles = [value.strip() for value in args.prompt_styles.split(",") if value.strip()]
        if not requested_styles or len(requested_styles) != len(set(requested_styles)):
            raise RuntimeError("auto prompt style list is empty or duplicated")
        for style in requested_styles:
            entry = (bank.get("styles") or {}).get(style)
            expected_role = "canonical-neutral" if style == "neutral" else style.replace("_", "-")
            if not entry or entry.get("role") != expected_role:
                raise RuntimeError(f"prompt style mismatch in bank: {style}")
            audio = (bank_path.parent / entry.get("audio", "")).resolve()
            expected_sha256 = str(entry.get("sha256") or "").lower()
            actual_sha256 = hashlib.sha256(audio.read_bytes()).hexdigest()
            if actual_sha256 != expected_sha256:
                raise RuntimeError(
                    f"prompt SHA-256 mismatch for {style}: expected {expected_sha256}, "
                    f"received {actual_sha256}"
                )
            if not entry.get("transcript"):
                raise RuntimeError(f"prompt transcript missing for {style}")
            prompt_sources[style] = {"audio": str(audio), "text": entry["transcript"], "sha256": actual_sha256}
    else:
        if not args.reference_audio or not args.reference_text or not args.reference_sha256 or len(args.reference_sha256) != 64:
            raise RuntimeError("single prompt mode requires reference audio, text and SHA-256")
        actual_reference_sha256 = hashlib.sha256(Path(args.reference_audio).read_bytes()).hexdigest()
        if actual_reference_sha256 != args.reference_sha256.lower():
            raise RuntimeError(
                f"reference SHA-256 mismatch: expected {args.reference_sha256.lower()}, "
                f"received {actual_reference_sha256}"
            )
        prompt_sources[args.prompt_style] = {"audio": args.reference_audio, "text": args.reference_text, "sha256": actual_reference_sha256}
    if not args.device.startswith("cuda") or not torch.cuda.is_available():
        raise RuntimeError("Qwen3-TTS requires a CUDA device at startup")
    start_temp = gpu_temperature()
    if start_temp > START_MAX_GPU_TEMP_C:
        raise RuntimeError(f"GPU start temperature {start_temp:.1f}C exceeds {START_MAX_GPU_TEMP_C}C gate")
    monitor_stop = threading.Event()
    monitor_state = {"peak": start_temp, "violation": None}
    def monitor():
        while not monitor_stop.wait(0.5):
            try:
                current = gpu_temperature(); monitor_state["peak"] = max(monitor_state["peak"], current)
                if current >= HARD_MAX_GPU_TEMP_C and monitor_state["violation"] is None:
                    monitor_state["violation"] = f"GPU temperature {current:.1f}C reached hard stop {HARD_MAX_GPU_TEMP_C}C"
                    # A generation kernel cannot be safely interrupted from
                    # Python on Windows. Terminate the worker immediately;
                    # the parent rejects the pending request and any partial
                    # WAV is never accepted.
                    os._exit(74)
            except Exception as exc:
                monitor_state["violation"] = f"GPU temperature monitor failed: {exc}"
    monitor_thread = threading.Thread(target=monitor, daemon=True); monitor_thread.start()
    torch.cuda.reset_peak_memory_stats()
    load_started = time.perf_counter()
    model = Qwen3TTSModel.from_pretrained(
        model_source,
        revision=None if args.model_local_path else model_revision,
        local_files_only=True,
        device_map=args.device,
        dtype=DTYPE,
        attn_implementation=args.attention_implementation,
    )
    load_seconds = time.perf_counter() - load_started
    load_peak_allocated = torch.cuda.max_memory_allocated()
    load_peak_reserved = torch.cuda.max_memory_reserved()
    if model.model.config.tts_model_type != "base" or model.model.config.tts_model_size != model_lock["size"]:
        raise RuntimeError("production worker requires the selected locked Qwen Base model and size")
    if any("lora_" in name.lower() or "adapter" in name.lower() for name, _ in model.model.named_parameters()):
        raise RuntimeError("production worker refuses LoRA or adapter parameters")
    # Base models support ICL voice cloning. Compute this once and reuse it for
    # every candidate in this process.
    prompt_cache = {
        style: model.create_voice_clone_prompt(
            ref_audio=source["audio"],
            ref_text=source["text"],
            x_vector_only_mode=False,
        )
        for style, source in prompt_sources.items()
    }
    prompt_hashes = {style: source["sha256"] for style, source in prompt_sources.items()}
    reply({
        "ready": True, "modelId": args.model, "modelRevision": model_revision,
        "dtype": "bfloat16", "device": args.device, "modelType": "base",
        "modelSize": model_lock["size"], "attentionImplementation": args.attention_implementation,
        "loadSeconds": load_seconds,
        "loadPeakAllocatedBytes": load_peak_allocated,
        "loadPeakReservedBytes": load_peak_reserved,
        "promptCached": True, "promptStyle": args.prompt_style,
        "promptStyles": list(prompt_cache), "promptHashes": prompt_hashes,
        "promptSha256": prompt_hashes.get(args.prompt_style),
        "promptBankSha256": prompt_bank_sha256,
        "loraLoaded": False, "adapterLoaded": False,
        "startGpuTempC": start_temp,
    })
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        request_id = None
        try:
            current_temp = gpu_temperature()
            if current_temp >= HARD_MAX_GPU_TEMP_C or monitor_state["violation"]:
                raise RuntimeError(f"GPU temperature {current_temp:.1f}C reached hard stop {HARD_MAX_GPU_TEMP_C}C")
            request = json.loads(line)
            request_id = request.get("id")
            text = str(request.get("text") or "").strip()
            style = str(request.get("style") or "").strip()
            output = Path(str(request.get("output") or ""))
            seed = int(request.get("seed"))
            temperature = float(request.get("temperature", 0.7))
            if not text:
                raise ValueError("text is required")
            if style not in prompt_cache:
                raise ValueError(
                    f"prompt style is not present in immutable cache: request={style!r}"
                )
            if seed < 0:
                raise ValueError("seed must be non-negative")
            if not 0.0 < temperature <= MAX_TEMPERATURE:
                raise ValueError(f"temperature must be in (0, {MAX_TEMPERATURE}]")
            output.parent.mkdir(parents=True, exist_ok=True)
            torch.manual_seed(seed)
            np.random.seed(seed % (2**32 - 1))
            torch.cuda.reset_peak_memory_stats()
            generation_started = time.perf_counter()
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language="Korean",
                voice_clone_prompt=prompt_cache[style],
                non_streaming_mode=True,
                temperature=temperature,
            )
            if not wavs:
                raise RuntimeError("Qwen3-TTS returned no audio")
            waveform = np.asarray(wavs[0], dtype=np.float32)
            if waveform.size == 0:
                raise RuntimeError("Qwen3-TTS returned empty audio")
            sf.write(str(output), waveform, int(sample_rate), subtype="PCM_16")
            if monitor_state["violation"]:
                raise RuntimeError(monitor_state["violation"])
            generation_seconds = time.perf_counter() - generation_started
            reply({"id": request_id, "ok": True, "output": str(output), "sampleRate": int(sample_rate), "seed": seed, "temperature": temperature, "peakGpuTempC": monitor_state["peak"], "generationSeconds": generation_seconds, "peakAllocatedBytes": torch.cuda.max_memory_allocated(), "peakReservedBytes": torch.cuda.max_memory_reserved()})
        except Exception as exc:  # Keep protocol alive so the caller can fail closed.
            reply({
                "id": request_id,
                "ok": False,
                "error": str(exc),
                "traceback": traceback.format_exc(),
                "inputType": type(locals().get("text")).__name__,
                "inputRepr": repr(locals().get("text"))[:500],
            })


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        reply({"ready": False, "error": str(exc)})
        raise
