"""Generate one event-bound ACE-Step 1.5 instrumental and its provenance manifest.

The script intentionally owns only orchestration and post-processing. Model
inference remains the official local ACE-Step implementation pinned by commit.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import soundfile as sf


ENGINE_ID = "ace-step-1.5-official-local-v1"
EXPECTED_COMMIT = "6d467e4b5081ccb0abf1ec1bf4fdf9051a2d34b0"
DIT_MODEL = "acestep-v15-turbo"
LM_MODEL = "acestep-5Hz-lm-0.6B"
LICENSE = "MIT (ACE-Step code and official model repository metadata)"


def run(command: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, text=True, **kwargs)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def probe(ffprobe: str, path: Path) -> dict:
    result = run([
        ffprobe, "-v", "error", "-show_entries",
        "format=duration:stream=codec_name,sample_rate,channels,bits_per_sample,bits_per_raw_sample",
        "-of", "json", str(path),
    ], capture_output=True)
    return json.loads(result.stdout)


def integrated_lufs(ffmpeg: str, path: Path) -> float:
    result = subprocess.run([
        ffmpeg, "-hide_banner", "-nostats", "-i", str(path), "-filter_complex",
        "ebur128=peak=true", "-f", "null", "NUL",
    ], text=True, capture_output=True, errors="replace")
    values = []
    for line in result.stderr.splitlines():
        if line.strip().startswith("I:") and "LUFS" in line:
            try:
                values.append(float(line.split("I:", 1)[1].split("LUFS", 1)[0].strip()))
            except ValueError:
                pass
    if not values:
        raise RuntimeError("ffmpeg ebur128 did not report integrated loudness")
    return values[-1]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ace-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--slug", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--duration", type=float, required=True)
    parser.add_argument("--bpm", type=int, default=68)
    parser.add_argument("--keyscale", default="D minor")
    parser.add_argument("--ffmpeg", default="ffmpeg")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()

    ace_root = args.ace_root.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    commit = run(["git", "-C", str(ace_root), "rev-parse", "HEAD"], capture_output=True).stdout.strip()
    if commit != EXPECTED_COMMIT:
        raise RuntimeError(f"ACE-Step commit mismatch: expected {EXPECTED_COMMIT}, received {commit}")

    # Imports occur only after the pinned repository has been verified.
    import sys
    sys.path.insert(0, str(ace_root))
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music

    dit = AceStepHandler()
    status, ok = dit.initialize_service(
        project_root=str(ace_root), config_path=DIT_MODEL, device="cuda",
        use_flash_attention=False, compile_model=False, offload_to_cpu=True,
        offload_dit_to_cpu=True, quantization="int8_weight_only",
    )
    if not ok:
        raise RuntimeError(f"ACE-Step DiT initialization failed: {status}")
    llm = LLMHandler()
    status, ok = llm.initialize(
        checkpoint_dir=str(ace_root / "checkpoints"), lm_model_path=LM_MODEL,
        backend="pt", device="cuda", offload_to_cpu=True,
    )
    if not ok:
        raise RuntimeError(f"ACE-Step LM initialization failed: {status}")

    params = GenerationParams(
        caption=args.prompt, lyrics="[Instrumental]", instrumental=True,
        bpm=args.bpm, keyscale=args.keyscale, timesignature="4",
        duration=args.duration, inference_steps=8, seed=args.seed,
        guidance_scale=6.0, thinking=False, use_cot_metas=False,
        use_cot_caption=False, use_cot_lyrics=False, use_cot_language=False,
    )
    config = GenerationConfig(batch_size=1, use_random_seed=False, seeds=[args.seed], audio_format="wav")
    raw_dir = output_dir / "raw"
    result = generate_music(dit, llm, params, config, save_dir=str(raw_dir))
    if not result.success or not result.audios:
        raise RuntimeError(f"ACE-Step generation failed: {result.error}")
    raw_path = Path(result.audios[0]["path"]).resolve()

    # Mechanical output contract: exact duration, 48 kHz stereo PCM24, -24 LUFS.
    staged = output_dir / "event-bgm-staged.wav"
    final = output_dir / "event-bgm.wav"
    run([
        args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw_path),
        "-af", f"apad,atrim=duration={args.duration:.3f}", "-ar", "48000", "-ac", "2",
        "-c:a", "pcm_s24le", str(staged),
    ])
    measured = integrated_lufs(args.ffmpeg, staged)
    gain = -24.0 - measured
    run([
        args.ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(staged),
        "-af", f"volume={gain:.6f}dB", "-ar", "48000", "-ac", "2",
        "-c:a", "pcm_s24le", str(final),
    ])
    staged.unlink()
    final_lufs = integrated_lufs(args.ffmpeg, final)
    if abs(final_lufs - (-24.0)) > 0.2:
        raise RuntimeError(f"BGM loudness gate failed: {final_lufs:.2f} LUFS")

    info = sf.info(str(final))
    manifest = {
        "schemaVersion": 1,
        "status": "ready",
        "engineContract": ENGINE_ID,
        "event": {"slug": args.slug},
        "provider": "ACE-Step 1.5 official local inference",
        "officialRepository": "https://github.com/ace-step/ACE-Step-1.5",
        "installedVersion": "1.5.0",
        "officialRepositoryCommit": commit,
        "model": {"dit": DIT_MODEL, "lm": LM_MODEL, "backend": "PyTorch", "device": "CUDA", "quantization": "int8_weight_only", "inferenceSteps": 8},
        "generation": {"prompt": args.prompt, "seed": args.seed, "lyrics": "[Instrumental]", "instrumental": True, "vocals": False, "bpm": args.bpm, "keyscale": args.keyscale, "durationSeconds": args.duration},
        "rights": {"license": LICENSE, "thirdPartySamples": False, "eventSpecific": True},
        "postProcess": {"sampleRate": 48000, "channels": 2, "format": "WAV PCM 24-bit", "targetLufs": -24.0, "measuredLufs": final_lufs, "method": "trim/pad, resample/downmix, deterministic gain-only EBU R128 correction"},
        "mixDefaults": {"volumeDb": -16, "duckUnderNarration": True, "fadeSeconds": 1.2},
        "output": "event-bgm.wav",
        "sha256": sha256(final),
        "rawProvenance": {"path": str(raw_path), "sha256": sha256(raw_path)},
        "probe": probe(args.ffprobe, final),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    }
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"audio": str(final), "manifest": str(manifest_path), "sha256": manifest["sha256"], "lufs": final_lufs}, ensure_ascii=False))


if __name__ == "__main__":
    main()
