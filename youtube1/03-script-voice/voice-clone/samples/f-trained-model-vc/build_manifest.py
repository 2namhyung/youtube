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
TRAINED_SAMPLE = (
    ROOT
    / "samples"
    / "f-fish-trained-20260726"
    / "F-fish-r8-step100-comparison-master.wav"
)
F_REFS = sorted((ROOT / "profiles" / "F" / "refs").glob("*.full.wav"))
PAIRS = {
    "C": (
        ROOT / "samples" / "f-trained-model-vc" / "provenance" / "C-carrier.wav",
        OUT / "raw" / "F-model-from-C-raw.wav",
        OUT / "F-model-from-C.wav",
        -0.6,
    ),
    "E": (
        ROOT / "samples" / "f-trained-model-vc" / "provenance" / "E-carrier.wav",
        OUT / "raw" / "F-model-from-E-raw.wav",
        OUT / "F-model-from-E.wav",
        -0.8,
    ),
}


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT.parent)).replace("\\", "/")


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
        "path": rel(path),
        "sha256": sha256(path),
        "format": f"{info.num_channels}ch {info.sample_rate} Hz {info.encoding}",
        "sampleRateHz": info.sample_rate,
        "channels": info.num_channels,
        "samples": info.num_frames,
        "durationSeconds": round(info.num_frames / info.sample_rate, 6),
        "samplePeakDbfs": round(
            20 * math.log10(max(float(np.max(np.abs(y))), 1e-12)), 3
        ),
        "clippedSamples": int(np.count_nonzero(np.abs(y) >= 1.0)),
    }


def loudness(path: Path) -> dict[str, float]:
    completed = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(path),
            "-af",
            "loudnorm=I=-22.9:TP=-2:LRA=7:print_format=json",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    matches = re.findall(r"\{\s*\"input_i\".*?\}", completed.stderr, re.S)
    if not matches:
        raise RuntimeError(f"could not parse loudness for {path}")
    data = json.loads(matches[-1])
    return {
        "integratedLufs": float(data["input_i"]),
        "truePeakDbtp": float(data["input_tp"]),
        "loudnessRangeLu": float(data["input_lra"]),
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
    return f0, voiced, [
        [round(start / sr, 3), round(end / sr, 3)] for start, end in intervals
    ]


def timing_pitch(source: Path, converted: Path) -> dict[str, object]:
    sf0, sv, source_intervals = pitch_and_silence(source)
    cf0, cv, converted_intervals = pitch_and_silence(converted)
    count = min(len(sf0), len(cf0))
    sf0, sv, cf0, cv = sf0[:count], sv[:count], cf0[:count], cv[:count]
    joint = sv & cv & np.isfinite(sf0) & np.isfinite(cf0)
    source_cents = 1200 * np.log2(sf0[joint])
    converted_cents = 1200 * np.log2(cf0[joint])
    return {
        "f0FrameHopMs": 5.0,
        "jointVoicedFrames": int(joint.sum()),
        "voicedFrameAgreement": round(float(np.mean(sv == cv)), 4),
        "f0ContourPearsonCents": round(
            float(pearsonr(source_cents, converted_cents).statistic), 4
        ),
        "f0ContourSpearmanCents": round(
            float(spearmanr(source_cents, converted_cents).statistic), 4
        ),
        "medianAbsoluteF0DifferenceCents": round(
            float(np.median(np.abs(converted_cents - source_cents))), 2
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
    feature = torchaudio.compliance.kaldi.fbank(
        speech, num_mel_bins=80, dither=0, sample_frequency=16000
    )
    feature = feature - feature.mean(dim=0, keepdim=True)
    return session.run(
        None, {session.get_inputs()[0].name: feature.unsqueeze(0).numpy()}
    )[0].flatten()


def cosine(left: np.ndarray, right: np.ndarray) -> float:
    return float(np.dot(left, right) / (np.linalg.norm(left) * np.linalg.norm(right)))


def main() -> None:
    manifest_path = OUT / "manifest.json"
    if manifest_path.exists():
        raise FileExistsError(f"Refusing to overwrite {manifest_path}")

    campplus = onnxruntime.InferenceSession(
        str(MODEL / "campplus.onnx"), providers=["CPUExecutionProvider"]
    )
    trained_embedding = speaker_embedding(TRAINED_SAMPLE, campplus)
    ref_embeddings = {
        ref.name: speaker_embedding(ref, campplus) for ref in F_REFS
    }
    anchor_similarities = {
        name: round(cosine(trained_embedding, embedding), 4)
        for name, embedding in ref_embeddings.items()
    }

    manifest: dict[str, object] = {
        "version": 1,
        "purpose": "Apply Fish-trained F timbre to original C/E carrier prosody using true speech-to-speech VC",
        "lineage": {
            "stage1": {
                "inputs": [basic(ref) for ref in F_REFS],
                "datasetManifest": "C:/Users/User/tools/fish-speech/data/F/dataset_manifest.json",
                "trainingReport": "voice-clone/training/F/TRAINING_REPORT.md",
                "selectedLora": "C:/Users/User/tools/fish-speech/results/F_lora_20260726_r8/checkpoints/step_000000100.ckpt",
                "mergedFishModel": "C:/Users/User/tools/fish-speech/checkpoints/fish-speech-1.5-F-r8-step100-20260726",
                "trainedVoiceSample": basic(TRAINED_SAMPLE),
            },
            "stage2": "trained F voice sample -> CosyVoice3 inference_vc target speaker; original C/E speech tokens remain the carriers",
        },
        "engine": {
            "name": "FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
            "revision": "29e01c4e8d000f4bcd70751be16fa94bf3d85a18",
            "mode": "AutoModel.inference_vc (source speech tokens; no text/TTS synthesis)",
            "device": "CUDA fp16; ONNX speaker encoder on CPU",
        },
        "parameters": {
            "seed": 20260726,
            "stream": False,
            "vcSpeed": 1.0,
            "rawOutputSamples": 200160,
            "targetSamples": 199200,
            "durationCorrection": {
                "engine": "FFmpeg rubberband",
                "tempo": 200160 / 199200,
                "pitch": 1.0,
                "percentDurationChange": round((1 - 199200 / 200160) * 100, 4),
                "options": "transients=crisp, detector=compound, phase=laminar, window=standard, smoothing=off, formant=preserved, pitchq=quality",
            },
            "loudness": "gain only after duration correction; C -0.6 dB, E -0.8 dB; no compression, denoise, or dynamic normalization",
        },
        "speakerAnchorQc": {
            "method": "CAMPPlus cosine; evidence of timbre direction, not a biometric claim",
            "trainedSampleToOriginalFRefs": anchor_similarities,
            "meanTrainedSampleToOriginalFRefs": round(
                float(np.mean(list(anchor_similarities.values()))), 4
            ),
        },
        "outputs": {},
    }

    for label, (source, raw, final, gain) in PAIRS.items():
        source_embedding = speaker_embedding(source, campplus)
        output_embedding = speaker_embedding(final, campplus)
        output_ref = {
            name: round(cosine(output_embedding, embedding), 4)
            for name, embedding in ref_embeddings.items()
        }
        carrier_ref = {
            name: round(cosine(source_embedding, embedding), 4)
            for name, embedding in ref_embeddings.items()
        }
        output_to_trained = cosine(output_embedding, trained_embedding)
        carrier_to_trained = cosine(source_embedding, trained_embedding)
        manifest["outputs"][f"F-model-from-{label}.wav"] = {
            "sourceCarrier": basic(source),
            "rawConversion": basic(raw),
            "final": {**basic(final), **loudness(final)},
            "postProcessing": {
                "gainDb": gain,
                "formantPreservingTempoOnly": True,
                "exactSampleLock": 199200,
            },
            "timingProsodyQc": timing_pitch(source, final),
            "speakerTimbreQc": {
                "campplusCosineOutputToTrainedSample": round(output_to_trained, 4),
                "campplusCosineCarrierToTrainedSample": round(carrier_to_trained, 4),
                "similarityGainTowardTrainedSample": round(
                    output_to_trained - carrier_to_trained, 4
                ),
                "campplusCosineOutputToOriginalFRefs": output_ref,
                "campplusCosineCarrierToOriginalFRefs": carrier_ref,
                "meanOutputToOriginalFRefs": round(float(np.mean(list(output_ref.values()))), 4),
                "meanCarrierToOriginalFRefs": round(float(np.mean(list(carrier_ref.values()))), 4),
                "meanSimilarityGainTowardOriginalFRefs": round(
                    float(np.mean(list(output_ref.values())))
                    - float(np.mean(list(carrier_ref.values()))),
                    4,
                ),
            },
        }

    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps(manifest["outputs"], ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
