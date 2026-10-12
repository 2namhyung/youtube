from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import subprocess
import sys
from pathlib import Path

import numpy as np


ENGINE_REVISION = "29e01c4e8d000f4bcd70751be16fa94bf3d85a18"
MODEL_ID = "Qwen/Qwen3-TTS-12Hz-0.6B-Base"
MODEL_REVISION = "5d83992436eae1d760afd27aff78a71d676296fc"
SEED = 20260808


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(command: list[str]) -> None:
    subprocess.run(command, check=True)


def ffmpeg_extract(source: Path, output: Path, start: float, end: float, loudness: float = -23.0) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{start:.3f}", "-to", f"{end:.3f}",
        "-i", str(source), "-af", f"loudnorm=I={loudness}:TP=-2:LRA=7", "-ac", "1", "-ar", "24000",
        "-c:a", "pcm_s16le", str(output),
    ])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace", type=Path, required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--ledger", type=Path, required=True)
    args = parser.parse_args()
    workspace = args.workspace.resolve()
    profile = args.profile.resolve()
    ledger = args.ledger.resolve()
    voice_root = workspace / "03-script-voice/voice-clone"
    cosyvoice_root = voice_root / "legacy-root-copy/vendor-root/CosyVoice"
    matcha_root = cosyvoice_root / "third_party/Matcha-TTS"
    model_dir = voice_root / "models/Fun-CosyVoice3-0.5B"
    carrier = workspace / "03-script-voice/reference-audio/instagram/DbLHxMtuRz0.wav"
    owner_dir = workspace / "03-script-voice/reference-audio/user"
    assets = profile / "prompt-bank/assets"
    provenance = profile / "provenance"
    assets.mkdir(parents=True, exist_ok=True)
    provenance.mkdir(parents=True, exist_ok=True)

    timbre_parts = [
        ("01_neutral.m4a", 0.55, 4.75),
        ("02_hook.m4a", 0.45, 4.65),
        ("03_news.m4a", 0.80, 5.00),
        ("04_tension.m4a", 0.75, 4.95),
        ("05_criticism.m4a", 0.70, 4.90),
        ("06_solution.m4a", 0.70, 4.90),
    ]
    part_paths = []
    for index, (name, start, end) in enumerate(timbre_parts, 1):
        part = provenance / f"owner-core-{index:02d}.wav"
        ffmpeg_extract(owner_dir / name, part, start, end)
        part_paths.append(part)
    concat_file = provenance / "owner-core.concat.txt"
    concat_file.write_text("".join(f"file '{path.as_posix()}'\n" for path in part_paths), encoding="utf-8")
    owner_core = provenance / "owner-timbre-core.wav"
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_file),
        "-af", "loudnorm=I=-23:TP=-2:LRA=7", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(owner_core),
    ])

    carrier_spans = {
        "hook": (0.0, 10.76, "철조망에 몸을 계속 비비고 있는 이 동물은 바로 원뱃입니다. 저번 호주 산불 때 많은 동물들을 자신의 굴로 숨겨 구해준 작은 영웅이죠. 그런데 원뱃이 몸을 여기저기 비비는 이유가 있습니다."),
        "news_exposition": (10.76, 18.60, "원뱃은 땅굴 파기의 달인으로 거의 매일 땅을 파며 살아가는데요. 그래서 몸에 흙이 많이 묻어 피부가 자주 가려워집니다."),
        "tension": (18.60, 25.40, "하지만 다리가 너무 짧아서 긁지 못하는 곳이 많죠. 그래서 주변의 나무나 철조망 같은 곳에 몸을 비비며 가려움을 해결합니다."),
        "legal_explanation": (25.40, 31.40, "사실 원뱃은 사람을 꽤 좋아하는 동물입니다. 사람과 함께 있는 걸 좋아하고 사람이 해주는 보살핌도 꽤 즐기는 편이죠."),
        "closing": (31.40, 37.88, "외형만 보면 작은 곰 같지만 실제로는 곰과 전혀 관계가 없습니다. 오히려 코알라와 더 가까운 친척이라고 하죠."),
    }
    carrier_files = {}
    for style, (start, end, _) in carrier_spans.items():
        segment = provenance / f"instagram-carrier-{style}.wav"
        ffmpeg_extract(carrier, segment, start, end, loudness=-22.9)
        carrier_files[style] = segment

    import torch
    import torchaudio
    if not torch.cuda.is_available():
        raise RuntimeError("CosyVoice owner-timbre conversion requires CUDA")
    sys.path.insert(0, str(cosyvoice_root))
    sys.path.insert(0, str(matcha_root))
    from cosyvoice.cli.cosyvoice import AutoModel
    os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
    random.seed(SEED)
    np.random.seed(SEED)
    torch.manual_seed(SEED)
    torch.cuda.manual_seed_all(SEED)
    model = AutoModel(model_dir=str(model_dir), load_trt=False, load_vllm=False, fp16=True)

    styles = {}
    conversion = []
    for style, source in carrier_files.items():
        chunks = [item["tts_speech"].detach().cpu() for item in model.inference_vc(str(source), str(owner_core), stream=False, speed=1.0)]
        if not chunks:
            raise RuntimeError(f"CosyVoice returned no audio for {style}")
        raw = provenance / f"{style}.raw.wav"
        torchaudio.save(str(raw), torch.cat(chunks, dim=1), model.sample_rate)
        final = assets / f"{style}.wav"
        run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
            "-af", "loudnorm=I=-22.9:TP=-2:LRA=7", "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(final),
        ])
        start, end, transcript = carrier_spans[style]
        styles[style] = {
            "role": style.replace("_", "-"),
            "audio": f"assets/{style}.wav",
            "sha256": sha256(final),
            "transcript": transcript,
            "source": "instagram-prosody-carrier-converted-to-owner-timbre",
            "carrierSpanSeconds": [start, end],
            "ownerVoice": True,
            "thirdPartySpeakerIdentityRetained": False,
        }
        conversion.append({"style": style, "carrier": str(source.relative_to(workspace)).replace("\\", "/"), "carrierSha256": sha256(source), "rawSha256": sha256(raw), "finalSha256": sha256(final)})

    question_source = voice_root / "profiles/qwen-f4-reference-guide-v1/prompt-bank/assets/question.wav"
    question = assets / "viewer_question.wav"
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(question_source), "-ac", "1", "-ar", "24000", "-c:a", "pcm_s16le", str(question)])
    styles["viewer_question"] = {
        "role": "viewer-question",
        "audio": "assets/viewer_question.wav",
        "sha256": sha256(question),
        "transcript": "현실에도 진짜 필요한 거 아니에요? 이게 말이 되나요? 하지만 수사 상황 통지와 피해자 보호는 필요하지 않을까요?",
        "source": "verified-owner-recording-question-spans",
        "sourceAudioSha256": "d6b4f584b578799dec8bc9e1916e4d85ac3e6e1c1d067a9331cb835432f0ae33",
        "ownerVoice": True,
        "thirdPartyAudio": False,
        "directTargetSplicingAllowed": False,
    }

    manifest = {
        "schemaVersion": 1,
        "profileId": "owner-voice-v1",
        "status": "candidate-pending-generation-validation",
        "productionEligible": False,
        "ownerVoice": True,
        "modelRoute": "versioned-prompt-bank-profile-no-sft",
        "model": {"id": MODEL_ID, "revision": MODEL_REVISION, "precision": "bf16", "language": "Korean", "loraAllowed": False, "adapterAllowed": False, "fallbackAllowed": False},
        "admissionLedger": {"path": str(ledger.relative_to(workspace)).replace("\\", "/"), "sha256": sha256(ledger)},
        "ownerTimbreCore": {
            "audio": str(owner_core.relative_to(profile)).replace("\\", "/"),
            "sha256": sha256(owner_core),
            "sources": [{"file": name, "sourceSha256": next(item["sha256"] for item in json.loads(ledger.read_text(encoding="utf-8"))["files"] if item["fileName"] == name), "spanSeconds": [start, end]} for name, start, end in timbre_parts],
        },
        "sourceAudit": {
            "method": "role-specific Instagram carrier spans -> CosyVoice3 inference_vc -> multi-recording owner timbre core",
            "thirdPartyProsodyCarrier": True,
            "thirdPartySpeakerIdentityRetained": False,
            "voiceConversionEngine": "FunAudioLLM/Fun-CosyVoice3-0.5B-2512",
            "voiceConversionRevision": ENGINE_REVISION,
            "carrierSha256": sha256(carrier),
            "usage": "local private generation only; do not redistribute carrier, guides, or biometric provenance",
        },
        "defaultStyle": "news_exposition",
        "styles": styles,
        "generationContract": {
            "targetUnit": "natural-sentence-or-semantic-paragraph",
            "phraseIsolationAllowed": False,
            "directOwnerTargetSpansAllowedOnlyWithExactAlignment": True,
            "fixedPauseSeconds": None,
            "pausePolicy": "preserve generated sentence rhythm; add variable boundary guards only when needed",
        },
        "validation": {"status": "pending", "dualAsrDiagnostic": ["small", "medium"], "heldOutLegalTerms": ["살인미수", "특수상해", "집행유예", "형이 줄었습니다"], "humanAudibleReviewRequired": True},
    }
    manifest_path = profile / "prompt-bank/manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    report = {
        "schemaVersion": 1,
        "seed": SEED,
        "engine": "FunAudioLLM/Fun-CosyVoice3-0.5B-2512 inference_vc",
        "revision": ENGINE_REVISION,
        "ownerTimbreCoreSha256": sha256(owner_core),
        "conversions": conversion,
        "manifest": str(manifest_path.relative_to(workspace)).replace("\\", "/"),
        "manifestSha256": sha256(manifest_path),
    }
    report_path = profile / "conversion-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"manifest": str(manifest_path), "manifestSha256": sha256(manifest_path), "styles": len(styles)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
