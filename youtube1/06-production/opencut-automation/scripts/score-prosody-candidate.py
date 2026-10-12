from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path


WORKSPACE = Path(__file__).resolve().parents[3]
PROSODY_MODULE = WORKSPACE / "03-script-voice" / "reference-audio" / "instagram" / "hyepang_pick"
sys.path.insert(0, str(PROSODY_MODULE))

from prosody_metrics import FEATURE_KEYS, analyze_audio_file, score_against_profile  # noqa: E402


STYLE_ORDER = ("hook", "news_exposition", "tension", "criticism", "solution_closing")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_profile(profile: dict[str, object]) -> None:
    if profile.get("schemaVersion") != 1:
        raise ValueError("Prosody profile schemaVersion must be 1")
    if profile.get("identityExcluded") is not True:
        raise ValueError("Prosody profile must exclude speaker identity")
    if profile.get("activeReferenceSex") != "male":
        raise ValueError("Prosody profile must use the male-only reference bank")
    source = profile.get("source")
    if not isinstance(source, dict) or source.get("thirdPartyAudio") is not True:
        raise ValueError("Prosody profile source contract is missing")
    forbidden = str(source.get("forbiddenUse", "")).lower()
    if "voice-clone prompt" not in forbidden and "speaker identity cloning" not in forbidden:
        raise ValueError("Prosody profile must forbid third-party voice cloning")
    contract = profile.get("featureContract")
    if not isinstance(contract, dict) or contract.get("absolutePitchExcludedFromScoring") is not True:
        raise ValueError("Absolute pitch must be excluded from prosody scoring")
    if tuple(contract.get("features", ())) != FEATURE_KEYS:
        raise ValueError("Prosody profile feature contract mismatch")
    styles = profile.get("styles")
    if not isinstance(styles, dict) or any(style not in styles for style in STYLE_ORDER):
        raise ValueError("Prosody profile must contain all five production styles")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", type=Path, required=True)
    text_group = parser.add_mutually_exclusive_group(required=True)
    text_group.add_argument("--text-file", type=Path)
    text_group.add_argument("--text")
    parser.add_argument("--style", choices=STYLE_ORDER, required=True)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    audio = args.audio.resolve()
    profile_path = args.profile.resolve()
    output = args.output.resolve()
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    validate_profile(profile)
    text = (args.text_file.resolve().read_text(encoding="utf-8") if args.text_file else args.text).strip()
    if not text:
        raise ValueError("Candidate text is empty")

    metrics = analyze_audio_file(audio, text)
    score = score_against_profile(metrics, profile["styles"][args.style])
    result = {
        "schemaVersion": 1,
        "profileId": profile["id"],
        "profileSha256": sha256(profile_path),
        "style": args.style,
        "candidateAudioSha256": sha256(audio),
        "identitySource": "owner F4 prompt only",
        "thirdPartyWaveformUsedForGeneration": False,
        "metrics": metrics,
        "scoring": score,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
