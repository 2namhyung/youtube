"""Generate a deterministic, sample-free instrumental bed for the Jeju short.

The synthesizer uses only Python's standard library and mathematical oscillators;
it does not load third-party recordings or call a network service.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import random
import struct
import wave
from datetime import datetime, timezone
from pathlib import Path


MODEL = "local-procedural-investigative-bed"
VERSION = "1.0.0"
LICENSE = "project-original-no-third-party-samples"


def envelope(position: float, attack: float, release: float) -> float:
    return min(1.0, position / attack if attack else 1.0, (1.0 - position) / release if release else 1.0)


def synthesize(output: Path, duration: float, seed: int, sample_rate: int = 44_100) -> None:
    rng = random.Random(seed)
    total = round(duration * sample_rate)
    phases = [rng.random() * math.tau for _ in range(4)]
    output.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(output), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        block = bytearray()
        for index in range(total):
            t = index / sample_rate
            master = envelope(index / total, 0.025, 0.035)
            # Sparse D-minor tension: sub-drone, fifth and a slowly beating minor third.
            drone = 0.34 * math.sin(math.tau * 73.416 * t + phases[0])
            drone += 0.17 * math.sin(math.tau * 110.0 * t + phases[1])
            drone += 0.11 * math.sin(math.tau * 87.307 * t + phases[2]) * (0.55 + 0.45 * math.sin(math.tau * 0.071 * t))
            # A restrained 72 BPM pulse; no melodic lead and no vocals.
            beat = (t * 1.2) % 1.0
            pulse = math.exp(-beat * 13.5) * math.sin(math.tau * (54.0 - 14.0 * beat) * t) * 0.24
            half_beat = (t * 2.4 + 0.5) % 1.0
            tick = math.exp(-half_beat * 32.0) * math.sin(math.tau * 880.0 * t) * 0.025
            # Slow stereo movement keeps the bed uneasy without distracting from speech.
            pan = 0.16 * math.sin(math.tau * 0.043 * t + phases[3])
            sample = math.tanh((drone + pulse + tick) * 0.72) * master
            left = max(-1.0, min(1.0, sample * (1.0 - pan)))
            right = max(-1.0, min(1.0, sample * (1.0 + pan)))
            block.extend(struct.pack("<hh", round(left * 32767), round(right * 32767)))
            if len(block) >= 1 << 20:
                wav.writeframesraw(block)
                block.clear()
        if block:
            wav.writeframesraw(block)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--duration", type=float, default=65.0)
    parser.add_argument("--seed", type=int, default=20260727)
    parser.add_argument("--prompt", required=True)
    args = parser.parse_args()
    synthesize(args.output, args.duration, args.seed)
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps({
        "status": "ready",
        "provider": "local-procedural",
        "model": MODEL,
        "version": VERSION,
        "seed": args.seed,
        "prompt": args.prompt,
        "instrumental": True,
        "vocals": False,
        "durationSeconds": args.duration,
        "sampleRate": 44100,
        "channels": 2,
        "license": LICENSE,
        "thirdPartySamples": False,
        "sha256": digest,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "output": str(args.output.resolve()),
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "sha256": digest, "manifest": str(args.manifest)}))


if __name__ == "__main__":
    main()
