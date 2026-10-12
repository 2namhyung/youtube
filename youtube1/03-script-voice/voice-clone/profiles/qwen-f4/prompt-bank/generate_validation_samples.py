#!/usr/bin/env python3
"""Generate fixed Base-only prompt-bank validation samples and signal metrics."""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import subprocess
import threading
import time
from pathlib import Path

import librosa
import numpy as np
import soundfile as sf
import torch
from qwen_tts import Qwen3TTSModel

ROOT = Path(__file__).resolve().parent
MANIFEST_PATH = ROOT / "manifest.json"
OUT = ROOT / "validation"
SAMPLES = OUT / "samples"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
MODEL_REVISION = "5d83992436eae1d760afd27aff78a71d676296fc"
SEED = 20260730
TEMPERATURE = 0.7
STYLES = ("hook", "news_exposition", "tension", "criticism", "solution_closing")
START_MAX_GPU_TEMP_C = 52
HARD_MAX_GPU_TEMP_C = 74


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def gpu_temperature() -> float:
    result = subprocess.run(
        ["nvidia-smi", "--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"],
        check=True, capture_output=True, text=True, timeout=5,
    )
    return max(float(value.strip()) for value in result.stdout.splitlines() if value.strip())


def normalize_count(text: str) -> int:
    return sum(character.isalnum() for character in text)


def audio_metrics(path: Path, text: str) -> tuple[dict, dict]:
    audio, sample_rate = sf.read(path, dtype="float32", always_2d=False)
    if audio.ndim != 1 or sample_rate != 24000 or not np.isfinite(audio).all():
        raise RuntimeError(f"invalid validation WAV: {path}")
    duration = len(audio) / sample_rate
    rms = librosa.feature.rms(y=audio, frame_length=600, hop_length=240, center=False)[0]
    silence_ratio = float(np.mean(rms < 0.01))
    f0, _, _ = librosa.pyin(audio, fmin=60.0, fmax=500.0, sr=sample_rate,
                            frame_length=2048, hop_length=240)
    f0 = f0[np.isfinite(f0)]
    if len(f0) < 10:
        raise RuntimeError(f"insufficient pitch frames: {path}")
    edge_n = min(len(audio), 480)
    edge_diffs = np.concatenate((np.diff(audio[:edge_n]), np.diff(audio[-edge_n:])))
    voiced_seconds = max(duration * (1.0 - silence_ratio), 1e-9)
    metrics = {
        "sampleRate": sample_rate, "durationSeconds": duration,
        "peak": float(np.max(np.abs(audio))),
        "clippedSampleRatio": float(np.mean(np.abs(audio) >= 0.999)),
        "silenceRatio": silence_ratio,
        "tempoCharactersPerVoicedSecond": normalize_count(text) / voiced_seconds,
        "medianF0Hz": float(np.median(f0)),
        "p10F0Hz": float(np.percentile(f0, 10)),
        "p90F0Hz": float(np.percentile(f0, 90)),
        "endpointAmplitude": float(max(abs(audio[0]), abs(audio[-1]))),
        "boundaryMaxAdjacentJump": float(np.max(np.abs(edge_diffs))),
    }
    gates = {
        "duration_3_to_30_seconds": 3.0 <= duration <= 30.0,
        "no_clipping": metrics["clippedSampleRatio"] == 0.0,
        "silence_ratio_le_0_45": silence_ratio <= 0.45,
        "tempo_3_to_15": 3.0 <= metrics["tempoCharactersPerVoicedSecond"] <= 15.0,
        "endpoint_amplitude_le_0_02": metrics["endpointAmplitude"] <= 0.02,
        "boundary_jump_le_0_25": metrics["boundaryMaxAdjacentJump"] <= 0.25,
    }
    return metrics, gates


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    if manifest["model"] != {
        "id": MODEL_ID, "revision": MODEL_REVISION, "precision": "bf16",
        "language": "Korean", "loraAllowed": False, "adapterAllowed": False,
    }:
        raise RuntimeError("prompt-bank canonical model invariant mismatch")
    for style in STYLES:
        entry = manifest["styles"][style]
        audio = (ROOT / entry["audio"]).resolve()
        source = (ROOT / entry["source"]).resolve()
        if sha256(audio).lower() != entry["sha256"].lower():
            raise RuntimeError(f"derived prompt hash mismatch: {style}")
        if sha256(source).lower() != entry["sourceSha256"].lower():
            raise RuntimeError(f"source prompt hash mismatch: {style}")
    start_temp = gpu_temperature()
    if start_temp > START_MAX_GPU_TEMP_C:
        raise RuntimeError(f"GPU start temperature {start_temp:.1f}C exceeds {START_MAX_GPU_TEMP_C}C")
    monitor_stop = threading.Event()
    monitor = {"peak": start_temp, "violation": None}

    def watch() -> None:
        while not monitor_stop.wait(0.5):
            try:
                current = gpu_temperature()
                monitor["peak"] = max(monitor["peak"], current)
                if current >= HARD_MAX_GPU_TEMP_C:
                    monitor["violation"] = f"GPU temperature {current:.1f}C reached {HARD_MAX_GPU_TEMP_C}C hard stop"
                    os._exit(74)
            except Exception as exc:
                monitor["violation"] = f"GPU monitor failed: {exc}"

    thread = threading.Thread(target=watch, daemon=True)
    thread.start()
    SAMPLES.mkdir(parents=True, exist_ok=True)
    report = {
        "status": "running", "support": "canonical-base-validation",
        "modelId": MODEL_ID, "modelRevision": MODEL_REVISION, "dtype": "bfloat16",
        "device": "cuda:0", "seed": SEED, "temperature": TEMPERATURE,
        "loraLoaded": False, "adapterLoaded": False, "styles": {},
        "startGpuTempC": start_temp,
    }
    try:
        model = Qwen3TTSModel.from_pretrained(
            MODEL_ID, revision=MODEL_REVISION, local_files_only=True,
            device_map="cuda:0", dtype=torch.bfloat16,
        )
        core = model.model
        if core.config.tts_model_type != "base" or core.config.tts_model_size != "0b6":
            raise RuntimeError("loaded model is not locked 0.6B Base")
        if any("lora_" in name.lower() or "adapter" in name.lower() for name, _ in core.named_parameters()):
            raise RuntimeError("production validation detected adapter-like parameters")
        for style in STYLES:
            entry = manifest["styles"][style]
            prompt = model.create_voice_clone_prompt(
                ref_audio=str((ROOT / entry["audio"]).resolve()),
                ref_text=entry["transcript"], x_vector_only_mode=False,
            )
            random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED); torch.cuda.manual_seed_all(SEED)
            wavs, sample_rate = model.generate_voice_clone(
                text=entry["validationText"], language="Korean",
                voice_clone_prompt=prompt, non_streaming_mode=True,
                temperature=TEMPERATURE,
            )
            if not wavs:
                raise RuntimeError(f"no output for {style}")
            waveform = np.asarray(wavs[0], dtype=np.float32)
            if sample_rate != 24000 or waveform.ndim != 1 or not waveform.size or not np.isfinite(waveform).all():
                raise RuntimeError(f"invalid output for {style}")
            output = SAMPLES / f"{style}.wav"
            sf.write(output, waveform, sample_rate, subtype="PCM_16")
            metrics, gates = audio_metrics(output, entry["validationText"])
            report["styles"][style] = {
                "text": entry["validationText"], "promptAudio": entry["audio"],
                "promptSha256": entry["sha256"].lower(), "promptTranscript": entry["transcript"],
                "output": str(output.relative_to(ROOT)).replace("\\", "/"),
                "outputSha256": sha256(output), "metrics": metrics, "audioGates": gates,
                "audioStatus": "pass" if all(gates.values()) else "fail",
                "peakGpuTempC": monitor["peak"],
            }
            if monitor["violation"]:
                raise RuntimeError(monitor["violation"])
        report["peakGpuTempC"] = monitor["peak"]
        report["status"] = "pass" if all(x["audioStatus"] == "pass" for x in report["styles"].values()) else "fail"
    finally:
        monitor_stop.set(); thread.join(timeout=2)
        report["finishedUtc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / "generation_report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
    print(json.dumps({"status": report["status"], "report": str(OUT / "generation_report.json")}))
    if report["status"] != "pass":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
