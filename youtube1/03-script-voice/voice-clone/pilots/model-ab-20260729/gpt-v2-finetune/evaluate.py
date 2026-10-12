"""Compare the bounded S1 fine-tune with the zero-shot GPT-SoVITS baseline."""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PILOT = HERE.parent
asr = json.loads((PILOT / "asr-result.json").read_text(encoding="utf-8"))
metrics = json.loads((PILOT / "audio-metrics.json").read_text(encoding="utf-8"))
base_camp = json.loads((PILOT / "campplus-similarity.json").read_text(encoding="utf-8"))
ft_camp = json.loads((HERE / "finetuned-campplus-similarity.json").read_text(encoding="utf-8"))

splits = ("critical", "heldout")
asr_rows = {}
for engine in ("primary", "turbo"):
    asr_rows[engine] = {}
    for split in splits:
        baseline = asr[engine]["gpt"][split]
        finetuned = asr[engine]["gpt_ft"][split]
        asr_rows[engine][split] = {
            "zero_shot_exact_normalized": baseline["exact_normalized"],
            "few_shot_exact_normalized": finetuned["exact_normalized"],
            "improved": (not baseline["exact_normalized"]) and finetuned["exact_normalized"],
            "zero_shot_transcript": baseline["transcript"],
            "few_shot_transcript": finetuned["transcript"],
        }

camp_rows = {}
for split in splits:
    base = base_camp["outputs"][f"gpt_{split}"]["cosine_to_f4_ref"]
    ft = ft_camp["outputs"][f"gpt_ft_{split}"]["cosine_to_f4_ref"]
    camp_rows[split] = {"zero_shot": base, "few_shot": ft, "delta": round(ft - base, 9), "improved": ft > base}

metric_rows = {}
for split in splits:
    base = metrics[f"gpt_{split}"]
    ft = metrics[f"gpt_ft_{split}"]
    metric_rows[split] = {
        "zero_shot_duration_seconds": base["duration_seconds"],
        "few_shot_duration_seconds": ft["duration_seconds"],
        "zero_shot_max_silence_seconds": base["max_silence_seconds"],
        "few_shot_max_silence_seconds": ft["max_silence_seconds"],
        "zero_shot_pitch_jump_count_gt_80hz": base["pitch_jump_count_gt_80hz"],
        "few_shot_pitch_jump_count_gt_80hz": ft["pitch_jump_count_gt_80hz"],
    }

strict_pass = all(row["few_shot_exact_normalized"] for engine in asr_rows for row in asr_rows[engine].values())
baseline_strict = all(row["zero_shot_exact_normalized"] for engine in asr_rows for row in asr_rows[engine].values())
improvement_gate = strict_pass and not baseline_strict
result = {
    "baseline": "GPT-SoVITS V2 zero-shot",
    "candidate": "GPT-SoVITS V2 S1 fine-tuned full-e2 checkpoint",
    "strict_gate": {"zero_shot": baseline_strict, "few_shot": strict_pass, "improvement_gate_pass": improvement_gate},
    "asr": asr_rows,
    "campplus": camp_rows,
    "audio_metrics": metric_rows,
    "decision": "REJECT_FEWSHOT_NO_STRICT_IMPROVEMENT" if not improvement_gate else "CANDIDATE_ONLY_STRICT_IMPROVEMENT",
    "production_model_changed": False,
}
(HERE / "evaluation.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"decision": result["decision"], "strict_gate": result["strict_gate"], "campplus": camp_rows}, ensure_ascii=False, indent=2))
