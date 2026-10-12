from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def compact(value: str) -> str:
    return "".join(character for character in value if character.isalnum())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--workspace", type=Path, required=True)
    args = parser.parse_args()

    workspace = args.workspace.resolve()
    audit = json.loads(args.audit.read_text(encoding="utf-8"))
    jeju_manifest_path = workspace / "03-script-voice/releases/qwen-jeju-canonical-20260801/manifest.json"
    voice_manifest_path = workspace / "03-script-voice/voice-clone/manifest.json"
    target_evidence_path = workspace / "03-script-voice/runs/F4-target-20260729/target-admission.json"
    retake_evidence_path = workspace / "03-script-voice/runs/F4-20260729/new-recordings-admission-rejection.json"
    evidence = {
        "jejuCanonical": {"path": jeju_manifest_path.relative_to(workspace).as_posix(), "sha256": sha256(jeju_manifest_path)},
        "legacyRoleManifest": {"path": voice_manifest_path.relative_to(workspace).as_posix(), "sha256": sha256(voice_manifest_path)},
        "targetAdmission": {"path": target_evidence_path.relative_to(workspace).as_posix(), "sha256": sha256(target_evidence_path)},
        "historicalMismatchAudit": {"path": retake_evidence_path.relative_to(workspace).as_posix(), "sha256": sha256(retake_evidence_path)},
    }

    main_roles = {
        "01_neutral.m4a": "neutral-timbre",
        "02_hook.m4a": "hook-role-evidence",
        "03_news.m4a": "news-exposition-role-evidence",
        "04_tension.m4a": "tension-role-evidence",
        "05_criticism.m4a": "criticism-role-evidence",
        "06_solution.m4a": "closing-role-evidence",
    }
    target_files = {"F4_target_bwat.m4a.m4a", "F4_target_gyogwon.m4a.m4a", "F4_target_songoeg.m4a.m4a"}
    extra_files = {f"F4_extra_{index:02d}.m4a.m4a" for index in range(1, 8)}
    decisions = []
    for item in audit["files"]:
        name = item["fileName"]
        base = {
            "fileName": name,
            "relativePath": item["relativePath"],
            "sha256": item["sha256"],
            "bytes": item["bytes"],
            "ownerVoice": True,
            "thirdPartyAudio": False,
            "originalPreservedReadOnly": True,
        }
        if item.get("kind") == "prosody-sidecar":
            base.update({
                "decision": "admitted",
                "uses": ["validation-provenance"],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": "Owner-file sidecar is retained as aggregate prosody provenance; it contains no exact transcript.",
            })
            decisions.append(base)
            continue

        signal = item["signal"]
        small = item["asr"]["small"]["transcript"]
        medium = item["asr"]["medium"]["transcript"]
        agreement = compact(small) == compact(medium)
        base["media"] = item["media"]
        base["signal"] = signal
        base["dualAsrDiagnostic"] = {
            "models": ["small", "medium"],
            "normalizedAgreement": agreement,
            "smallArtifact": item["asr"]["small"]["artifact"],
            "smallArtifactSha256": item["asr"]["small"]["artifactSha256"],
            "mediumArtifact": item["asr"]["medium"]["artifact"],
            "mediumArtifactSha256": item["asr"]["medium"]["artifactSha256"],
            "exactTranscriptClaimed": False,
        }

        if name.endswith(".prosody.wav"):
            base.update({
                "decision": "admitted",
                "uses": ["prosody-validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": "Derived owner prosody waveform is useful for aggregate validation but its derivation does not prove an exact transcript.",
            })
        elif name == "녹음.m4a":
            base.update({
                "decision": "rejected",
                "uses": [],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": "Only 3.09 seconds, 70.8% silence, and the two recognizers disagree on the short utterance.",
            })
        elif name in main_roles:
            exact_prompt = name in {"01_neutral.m4a", "02_hook.m4a", "06_solution.m4a"}
            base.update({
                "decision": "admitted",
                "uses": ["owner-timbre-core", main_roles[name], "validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": exact_prompt,
                "reason": "Clean unclipped owner role recording; only manifest-backed aligned prompt spans are eligible for direct prompt use." if exact_prompt else "Clean unclipped owner role recording; no authoritative full transcript, so it is timbre/role evidence rather than supervised training data.",
            })
        elif name == "녹음 (3).m4a":
            base.update({
                "decision": "admitted",
                "uses": ["viewer-question-guide", "direct-owner-span", "validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": True,
                "reason": "Question spans are pinned in the Jeju canonical manifest and current small/medium ASR agrees after normalization.",
            })
            base["directSpanAuthority"] = evidence["jejuCanonical"]
        elif name in target_files:
            base.update({
                "decision": "admitted",
                "uses": ["held-out-pronunciation-validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": "Historical large-v3/turbo admission proves the scripted retake, but it is reserved as held-out validation for the new profile.",
            })
            base["transcriptAuthority"] = evidence["targetAdmission"]
        elif name == "F4_validation.wav.m4a":
            base.update({
                "decision": "admitted",
                "uses": ["held-out-validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": "Existing validation lock prohibits training, augmentation, or prompt use.",
            })
            base["validationAuthority"] = evidence["targetAdmission"]
        elif name == "F4_train.wav.m4a":
            base.update({
                "decision": "admitted",
                "uses": ["failure-mode-validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": "Prior pronunciation mismatches make this unsafe as supervised training; retained to detect regressions and recognizer bias.",
            })
        elif name in extra_files:
            base.update({
                "decision": "admitted",
                "uses": ["owner-timbre-clean-span-candidate", "failure-mode-validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": "Owner timbre remains usable in clean speech spans, while the historical audit documents transcript mismatches that forbid supervised training or direct target splicing.",
            })
            base["mismatchAuthority"] = evidence["historicalMismatchAudit"]
        elif name in {"녹음 (4).m4a", "녹음 (5).m4a"}:
            base.update({
                "decision": "admitted-with-restrictions",
                "uses": ["clean-span-timbre-candidate", "held-out-nurse-legal-validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": f"Decoded source contains {signal['clippedSamples']} clipped samples; whole-file prompts/training and target splicing are forbidden. Only separately verified unclipped timbre spans may be used.",
            })
        else:
            base.update({
                "decision": "admitted",
                "uses": ["owner-timbre-clean-span-candidate", "validation"],
                "trainingEligible": False,
                "directOwnerSpanEligible": False,
                "reason": "Owner recording is retained for timbre/validation, but no authoritative exact transcript supports supervised training or target splicing.",
            })
        decisions.append(base)

    output = {
        "schemaVersion": 1,
        "ledgerId": "owner-voice-v1-admission-20260808",
        "status": "final",
        "createdBy": "03-script-voice/scripts/finalize-owner-voice-admission.py",
        "sourceAudit": {"path": args.audit.as_posix(), "sha256": sha256(args.audit)},
        "authorization": {
            "authorizedAt": "2026-08-08",
            "scope": "local owner voice model, TTS, and private video generation",
            "ownerVoice": True,
            "thirdPartyAudio": False,
            "externalPublishAuthorized": False,
        },
        "modelRoute": {
            "type": "versioned-prompt-bank-profile",
            "fullSft": False,
            "reason": "The corpus lacks authoritative transcripts for many files, contains known script mismatches and two clipped sources, and has no held-out evidence that an 8 GB GPU fine-tune would outperform the locked Base model safely.",
            "lockedModel": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
            "lockedRevision": "5d83992436eae1d760afd27aff78a71d676296fc",
            "loraAllowed": False,
            "adapterAllowed": False,
            "fallbackAllowed": False,
        },
        "evidence": evidence,
        "counts": {
            "total": len(decisions),
            "admitted": sum(item["decision"] == "admitted" for item in decisions),
            "admittedWithRestrictions": sum(item["decision"] == "admitted-with-restrictions" for item in decisions),
            "rejected": sum(item["decision"] == "rejected" for item in decisions),
        },
        "files": decisions,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "sha256": sha256(args.output), "counts": output["counts"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
