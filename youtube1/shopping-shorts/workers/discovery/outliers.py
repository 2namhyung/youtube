from datetime import datetime
from statistics import median


def analyze(data):
    """Only caller-authorized snapshots. Counts and ratios never come from Luna."""
    rows = data["snapshots"]
    candidate_id, hours = data["candidate_id"], data["age_hours"]
    parsed = []
    for row in rows:
        r = dict(row)
        r["published"] = datetime.fromisoformat(r["published_at"])
        r["observed"] = datetime.fromisoformat(r["observed_at"])
        r["age_error"] = abs((r["observed"] - r["published"]).total_seconds() / 3600 - hours)
        parsed.append(r)
    candidates = [r for r in parsed if r["video_id"] == candidate_id and r["views"] is not None]
    if not candidates:
        return {"status": "INSUFFICIENT_BASELINE", "sample_count": 0, "lift": None}
    c = min(candidates, key=lambda r: r["age_error"])
    valid = [r for r in parsed if r["video_id"] != candidate_id and r["channel_id"] == c["channel_id"]
             and r["published"] < c["published"] and r["views"] is not None
             and r["provider"] == c["provider"] and r["definition"] == c["definition"]
             and r["shorts_status"] == "confirmed" and r["commerce_type"] not in {"unknown", "unrelated"}]
    exact = c["age_error"] <= .5
    if exact:
        valid = [r for r in valid if r["age_error"] <= .5]
    selected = {}
    for row in sorted(valid, key=lambda r: r["age_error"]):
        selected.setdefault(row["video_id"], row)
    cohort = sorted(selected.values(), key=lambda r: r["published"], reverse=True)[:30]
    strict = [r for r in cohort if r["commerce_type"] == c["commerce_type"]]
    relaxed = len(strict) < 10
    if not relaxed:
        cohort = strict
    mid = median(r["views"] for r in cohort) if cohort else None
    lift = c["views"] / mid if mid else None
    sufficient = len(cohort) >= 10
    candidate_valid = c["shorts_status"] == "confirmed" and c["commerce_type"] not in {"unknown", "unrelated"}
    outlier = sufficient and candidate_valid and mid is not None and mid <= 5000 and c["views"] >= 50000 and lift is not None and lift >= 10
    status = ("CONFIRMED_OUTLIER" if exact else "PROVISIONAL_OUTLIER") if outlier else ("NOT_OUTLIER" if sufficient else "INSUFFICIENT_BASELINE")
    velocity = []
    for video_id in {r["video_id"] for r in parsed}:
        history = sorted([r for r in parsed if r["video_id"] == video_id], key=lambda r: r["observed"])
        for prev, current in zip(history, history[1:]):
            elapsed = (current["observed"] - prev["observed"]).total_seconds() / 3600
            if elapsed > 0 and prev["views"] is not None and current["views"] is not None and prev["provider"] == current["provider"] and prev["definition"] == current["definition"]:
                delta = current["views"] - prev["views"]
                velocity.append({"video_id": video_id, "status": "CORRECTION" if delta < 0 else "MEASURED", "views_per_hour": None if delta < 0 else delta / elapsed})
    return {"status": status, "sample_count": len(cohort), "median": mid, "lift": lift, "baseline_zero": mid == 0,
            "candidate_views": c["views"], "candidate_id": candidate_id, "age_hours": hours, "age_aligned": exact,
            "cohort_relaxed": relaxed, "cohort_ids": [r["video_id"] for r in cohort], "provider": c["provider"],
            "definition": c["definition"], "observed_at": c["observed_at"], "velocity": velocity, "rule": "median-5000-views-50000-lift10-v1"}
