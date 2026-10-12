"""Attach bounded GPT-SoVITS V2 S1 few-shot evidence to the pilot manifest."""
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest().upper()


manifest_path = PILOT / "pilot-manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
train = json.loads((HERE / "train-result.json").read_text(encoding="utf-8"))
prep = json.loads((HERE / "prep-result.json").read_text(encoding="utf-8"))
gen = json.loads((HERE / "finetuned-result.json").read_text(encoding="utf-8"))
asr = json.loads((PILOT / "asr-result.json").read_text(encoding="utf-8"))
metrics = json.loads((PILOT / "audio-metrics.json").read_text(encoding="utf-8"))
camp = json.loads((HERE / "finetuned-campplus-similarity.json").read_text(encoding="utf-8"))
evaluation = json.loads((HERE / "evaluation.json").read_text(encoding="utf-8"))
checkpoint = HERE / "training" / "full" / "weights" / "model-ab-20260729-gpt-v2-full-e2.ckpt"
dataset_manifest = HERE / "dataset" / "dataset-manifest.json"

manifest["models"]["gpt_sovits_finetuned"] = {
    "status": gen["status"],
    "variant": "V2 S1 GPT fine-tune; SoVITS S2 not run",
    "license": "MIT (official repository)",
    "checkpoint": str(checkpoint),
    "checkpoint_sha256": sha(checkpoint),
    "dataset_manifest": str(dataset_manifest),
    "dataset_manifest_sha256": sha(dataset_manifest),
    "feature_prep": prep,
    "training": train,
    "generation": gen,
    "asr": {"primary": asr["primary"]["gpt_ft"], "turbo": asr["turbo"]["gpt_ft"]},
    "audio_metrics": {"critical": metrics["gpt_ft_critical"], "heldout": metrics["gpt_ft_heldout"]},
    "speaker_similarity": camp,
    "evaluation": evaluation,
    "s2_status": "not_run_8GB_safety_scope",
    "production_model_changed": False,
}
manifest["decision"] = "GPT-SoVITS V2 S1 few-shot candidate generated; CAMPPlus improved but strict dual-ASR improvement gate failed, so no model promotion."
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"decision": manifest["decision"], "checkpoint_sha256": manifest["models"]["gpt_sovits_finetuned"]["checkpoint_sha256"]}, ensure_ascii=False))
