from __future__ import annotations

import hashlib
import json
import math
import re
import subprocess
from pathlib import Path

import librosa
import numpy as np
import onnxruntime
import torch
import torchaudio
from scipy.stats import pearsonr, spearmanr


ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
MODEL = ROOT / "models" / "Fun-CosyVoice3-0.5B"
TARGET_FULL = ROOT / "profiles" / "F" / "refs" / "02_hook.full.wav"
TARGET_PROMPT = ROOT / "samples" / "f-comparison-v2" / "F-prompt.wav"
PAIRS = {
    "C": (
        ROOT / "samples" / "f-trained-model-vc" / "provenance" / "C-carrier.wav",
        OUT / "raw" / "F-from-C-raw.wav",
        OUT / "F-from-C.wav",
    ),
    "E": (
        ROOT / "samples" / "f-trained-model-vc" / "provenance" / "E-carrier.wav",
        OUT / "raw" / "F-from-E-raw.wav",
        OUT / "F-from-E.wav",
    ),
}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest().upper()


def audio(path: Path, sr: int = 24000) -> tuple[np.ndarray, int]:
    data, source_sr = librosa.load(path, sr=None, mono=True)
    if source_sr != sr:
        data = librosa.resample(data, orig_sr=source_sr, target_sr=sr)
    return data.astype(np.float32), sr


def basic(path: Path) -> dict[str, object]:
    info = torchaudio.info(str(path))
    y, _ = audio(path, info.sample_rate)
    return {
        "sha256": sha256(path),
        "format": f"{info.num_channels}ch {info.sample_rate} Hz {info.encoding}",
        "sampleRateHz": info.sample_rate,
        "channels": info.num_channels,
        "samples": info.num_frames,
        "durationSeconds": round(info.num_frames / info.sample_rate, 6),
        "samplePeakDbfs": round(20 * math.log10(max(float(np.max(np.abs(y))), 1e-12)), 3),
        "clippedSamples": int(np.count_nonzero(np.abs(y) >= 1.0)),
    }


def loudness(path: Path) -> dict[str, float]:
    completed = subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
            "-af", "loudnorm=I=-22.9:TP=-2:LRA=7:print_format=json",
            "-f", "null", "-",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    matches = re.findall(r"\{\s*\"input_i\".*?\}", completed.stderr, re.S)
    if not matches:
        raise RuntimeError(f"could not parse ffmpeg loudness data for {path}")
    record = json.loads(matches[-1])
    return {
        "integratedLufs": float(record["input_i"]),
        "truePeakDbtp": float(record["input_tp"]),
        "loudnessRangeLu": float(record["input_lra"]),
    }


def pitch_and_silence(path: Path) -> tuple[np.ndarray, np.ndarray, list[list[float]]]:
    y, sr = audio(path, 24000)
    f0, voiced, _ = librosa.pyin(
        y,
        fmin=60,
        fmax=500,
        sr=sr,
        frame_length=1024,
        hop_length=120,
        center=True,
    )
    intervals = librosa.effects.split(
        y, top_db=35, frame_length=1024, hop_length=120
    )
    nonsilent = [[round(a / sr, 3), round(b / sr, 3)] for a, b in intervals]
    return f0, voiced, nonsilent


def timing_pitch(source: Path, converted: Path) -> dict[str, object]:
    sf0, sv, source_intervals = pitch_and_silence(source)
    cf0, cv, converted_intervals = pitch_and_silence(converted)
    count = min(len(sf0), len(cf0))
    sf0, sv, cf0, cv = sf0[:count], sv[:count], cf0[:count], cv[:count]
    joint = sv & cv & np.isfinite(sf0) & np.isfinite(cf0)
    cents_source = 1200 * np.log2(sf0[joint])
    cents_converted = 1200 * np.log2(cf0[joint])
    pearson = pearsonr(cents_source, cents_converted).statistic if joint.sum() > 3 else math.nan
    spearman = spearmanr(cents_source, cents_converted).statistic if joint.sum() > 3 else math.nan
    return {
        "f0FrameHopMs": 5.0,
        "jointVoicedFrames": int(joint.sum()),
        "voicedFrameAgreement": round(float(np.mean(sv == cv)), 4),
        "f0ContourPearsonCents": round(float(pearson), 4),
        "f0ContourSpearmanCents": round(float(spearman), 4),
        "medianAbsoluteF0DifferenceCents": round(
            float(np.median(np.abs(cents_converted - cents_source))), 2
        ),
        "sourceNonSilentIntervalsSeconds": source_intervals,
        "convertedNonSilentIntervalsSeconds": converted_intervals,
        "silenceDetection": "librosa.effects.split(top_db=35, frame=1024, hop=120)",
    }


def speaker_embedding(path: Path, session: onnxruntime.InferenceSession) -> np.ndarray:
    speech, sr = torchaudio.load(str(path), backend="soundfile")
    speech = speech.mean(dim=0, keepdim=True)
    if sr != 16000:
        speech = torchaudio.functional.resample(speech, sr, 16000)
    feat = torchaudio.compliance.kaldi.fbank(
        speech,
        num_mel_bins=80,
        dither=0,
        sample_frequency=16000,
    )
    feat = feat - feat.mean(dim=0, keepdim=True)
    return session.run(
        None, {session.get_inputs()[0].name: feat.unsqueeze(0).numpy()}
    )[0].flatten()


def cosine(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.dot(left, right) / (np.linalg.norm(left) * np.linalg.norm(right)))


def main() -> None:
    campplus = onnxruntime.InferenceSession(
        str(MODEL / "campplus.onnx"), providers=["CPUExecutionProvider"]
    )
    prompt_embedding = speaker_embedding(TARGET_PROMPT, campplus)
    manifest: dict[str, object] = {
        "version": 1,
        "purpose": "True speech-to-speech conversion of C/E carriers to F timbre",
        "engine": {
            "name": "FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
            "revision": "29e01c4e8d000f4bcd70751be16fa94bf3d85a18",
            "mode": "AutoModel.inference_vc (source speech tokens; no text/TTS synthesis)",
            "entrypoint": "voice-clone/vendor/CosyVoice/cosyvoice/cli/cosyvoice.py:129",
            "device": "CUDA fp16; ONNX tokenizer/speaker encoder on CPU provider",
            "manualModelDownload": False,
            "runtimeDependencyFetch": "ModelScope wetext automatic cache check/fetch during AutoModel initialization; VC itself used no text frontend",
        },
        "parameters": {
            "seed": 20260726,
            "stream": False,
            "vcSpeed": 1.0,
            "sourceTokenRateHz": 25,
            "rawOutputSamples": 200640,
            "targetSamples": 199200,
            "durationCorrection": {
                "engine": "FFmpeg rubberband",
                "tempo": 200640 / 199200,
                "pitch": 1.0,
                "percentDurationChange": round((1 - 199200 / 200640) * 100, 4),
                "options": "transients=crisp, detector=compound, phase=laminar, window=standard, smoothing=off, formant=preserved, pitchq=quality",
            },
            "loudness": "two-pass FFmpeg loudnorm I=-22.9 LUFS, TP=-2 dBTP, LRA=7; resampled to 24 kHz; exact atrim/apad to 199200 samples",
        },
        "targetSpeaker": {
            "profile": "F (user-owned recordings)",
            "availableFullReferences": [],
            "selectedFullReference": str(TARGET_FULL.relative_to(ROOT.parent)).replace("\\", "/"),
            "selectedFullReferenceSha256": sha256(TARGET_FULL),
            "prompt": str(TARGET_PROMPT.relative_to(ROOT.parent)).replace("\\", "/"),
            "promptSha256": sha256(TARGET_PROMPT),
            "promptExtraction": {
                "source": "02_hook.full.wav",
                "startSeconds": 1.225583,
                "endSeconds": 13.080458,
                "durationSeconds": 11.854875,
                "basis": "Complete voiced hook segment bounded by detected sentence silence",
            },
        },
        "outputs": {},
        "qcMethodNotes": {
            "speakerEvidence": "Cosine similarity from the same CAMPPlus speaker encoder used by CosyVoice. Higher output-to-F than carrier-to-F supports timbre transfer; not a biometric identity claim.",
            "contentTiming": "Exact sample lock plus source/output F0-in-cents and silence intervals. VC uses the source speech-token sequence directly and bypasses the LLM/text path.",
        },
    }
    for ref in sorted((ROOT / "profiles" / "F" / "refs").glob("*.full.wav")):
        item = basic(ref)
        manifest["targetSpeaker"]["availableFullReferences"].append(
            {"path": str(ref.relative_to(ROOT.parent)).replace("\\", "/"), **item}
        )

    for label, (source, raw, final) in PAIRS.items():
        source_embedding = speaker_embedding(source, campplus)
        output_embedding = speaker_embedding(final, campplus)
        manifest["outputs"][f"F-from-{label}.wav"] = {
            "source": {
                "path": str(source.relative_to(ROOT.parent)).replace("\\", "/"),
                **basic(source),
            },
            "rawConversion": {
                "path": str(raw.relative_to(ROOT.parent)).replace("\\", "/"),
                **basic(raw),
            },
            "final": {
                "path": str(final.relative_to(ROOT.parent)).replace("\\", "/"),
                **basic(final),
                **loudness(final),
            },
            "timingProsodyQc": timing_pitch(source, final),
            "speakerTimbreQc": {
                "campplusCosineOutputToFPrompt": round(cosine(output_embedding, prompt_embedding), 4),
                "campplusCosineCarrierToFPrompt": round(cosine(source_embedding, prompt_embedding), 4),
                "similarityGainTowardF": round(
                    cosine(output_embedding, prompt_embedding)
                    - cosine(source_embedding, prompt_embedding),
                    4,
                ),
            },
        }

    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest["outputs"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
