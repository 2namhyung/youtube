"""Diverse reading queue and operator-grounded story grouping, before commerce."""
from collections import Counter
from datetime import datetime, timedelta, timezone
import re

from apps.api.store import require
from packages.contracts.story_discovery import NarrativeIntake

LANES = {
    "relationships": ("친구 사이 반전 썰", "가족 사이 생긴 일", "연애 일상 반전 이야기"),
    "work": ("직장 생활 황당한 썰", "알바하다 생긴 일", "회사에서 벌어진 반전"),
    "daily_life": ("자취하다 생긴 일", "이웃 사이 일상 이야기", "일상 예상 못한 결말"),
    "hobbies": ("러닝 모임 이야기", "캠핑하다 생긴 일", "취미 동호회 문화 변화"),
    "culture": ("요즘 소비문화 바뀐 이유", "음식 문화 의외의 이야기", "요즘 유행하는 행동 이유"),
    "curiosity": ("일상 몰랐던 사실", "익숙한 습관 의외의 이유", "우연히 발견한 이야기"),
}
HINTS = {
    "relationships": ("친구", "아빠", "엄마", "부부", "시엄마", "시어머니", "며느리", "남편", "아내", "연애", "신혼"),
    "work": ("직장", "회사", "알바", "상사", "퇴사", "현장직", "사장", "기업", "출근", "퇴근", "연봉"),
    "daily_life": ("자취", "이웃", "아파트", "침대", "택배", "냉장고", "생활"),
    "hobbies": ("러닝", "조깅", "캠핑", "등산", "취미", "운동", "동호회"),
    "culture": ("유행", "문화", "디저트", "떡", "푸딩", "소비", "니트"),
    "curiosity": ("비화", "발명", "몰랐", "탄생", "원래", "이유"),
}


def latest_intakes(store):
    rows = {}
    for r in store.list("story-intake"):
        rows.setdefault(r["data"]["video_id"], r)
    return rows


def validate_intake(store, body: NarrativeIntake):
    require(any(r["data"]["video_id"] == body.video_id for r in store.list("story-video")),
            "UNKNOWN_VIDEO", "Read a collected candidate before registering its story")
    proofs = [store.get(rid, "story-evidence") for rid in body.evidence_ids]
    if body.decision == "candidate":
        require(any(r["data"]["surface"] in {"web-article", "chrome-article", "chrome-video", "provided-transcript"} for r in proofs),
                "CONTENT_EVIDENCE_REQUIRED", "Search titles alone cannot establish the story")


def submit_intake(store, body: NarrativeIntake):
    validate_intake(store, body)
    rid = store.record("story-intake", body.model_dump(mode="json"))
    return store.get(rid, "story-intake")


def submit_intake_batch(store, body):
    for item in body.items:
        validate_intake(store, item)
    with store.transaction() as db:
        ids = [store.record("story-intake", item.model_dump(mode="json"), connection=db) for item in body.items]
    return {"saved_ids": ids, "next_reading_queue": reading_queue(store, limit=5)}


def metadata_hint(video):
    title = video.get("title", "")
    domain = max(HINTS, key=lambda d: sum(term in title for term in HINTS[d]))
    matches = [term for term in HINTS[domain] if term in title]
    narrative = [term for term in ("이유", "반전", "결말", "벌어진", "생긴", "왜", "사연", "썰", "몰랐", "사실", "비화") if term in title]
    flags = []
    hangul = len(re.findall("[가-힣]", title))
    cjk = len(re.findall("[一-鿿]", title))
    if hangul < 3 or cjk > hangul:
        flags.append("language_check")
    if video.get("duration_seconds", 0) > 180:
        flags.append("long_reference")
    if not video.get("duration_seconds"):
        flags.append("duration_unknown")
    if any(t in title for t in ("추천템", "할인", "최저가", "구매링크", "쇼핑")):
        flags.append("commercial_title")
    return {"domain_hint": domain if matches else "curiosity", "title_clues": narrative,
            "flags": flags, "semantic_status": "metadata_only"}


def reading_queue(store, limit=12):
    reviewed = latest_intakes(store)
    channels = {}
    for r in store.list("story-channel"):
        channels.setdefault(r["data"]["channel_id"], r["data"])
    timestamp = datetime.now(timezone.utc)
    videos = {}
    for r in store.list("story-video"):
        videos.setdefault(r["data"]["video_id"], r["data"])
    metrics = {}
    for r in store.list("story-metric"):
        metrics.setdefault(r["data"]["video_id"], r["data"])
    groups = {lane: [] for lane in LANES}
    for vid, video in videos.items():
        intake = reviewed.get(vid, {}).get("data", {})
        if intake.get("decision") in {"candidate", "reject"}:
            continue
        channel = channels.get(video["channel_id"], {})
        fresh = channel and timestamp - timedelta(days=7) <= datetime.fromisoformat(channel["observed_at"]) <= timestamp
        if fresh and channel.get("status") == "below_minimum":
            continue
        hint = metadata_hint(video)
        row = {k: v for k, v in video.items() if k not in {"api_response", "stats_metadata_response"}}
        if vid in metrics:
            row["views"] = metrics[vid]["views"]
        row.update(hint)
        row["description"] = row.get("description", "")[:1500]
        row["activity_status"] = channel.get("status", "activity_unknown") if fresh else "activity_unknown"
        row["reading_purpose"] = "상품을 고려하지 않고 도입·변화·결말과 사실/창작 여부 확인"
        row["intake_status"] = intake.get("decision", "unread")
        groups[hint["domain_hint"]].append(row)
    for group in groups.values():
        # This orders reading work; it is not a semantic or trend score.
        group.sort(key=lambda v: (v["intake_status"] == "needs_content", "language_check" in v["flags"],
                                 "commercial_title" in v["flags"], not bool(v["title_clues"]),
                                 "long_reference" in v["flags"], -(v.get("views") or 0)))
    chosen, channel_counts = [], Counter()
    while any(groups.values()) and len(chosen) < limit:
        for group in groups.values():
            while group:
                row = group.pop(0)
                if channel_counts[row["channel_id"]] < 2:
                    channel_counts[row["channel_id"]] += 1
                    chosen.append(row)
                    break
            if len(chosen) >= limit:
                break
    return chosen


def narrative_groups(store):
    groups = {}
    for record in latest_intakes(store).values():
        r = record["data"]
        if r["decision"] != "candidate":
            continue
        group = groups.setdefault(r["event_key"], {"event_key": r["event_key"], "members": [], "trend_status": "not_evaluated"})
        group["members"].append({"intake_id": record["id"], **r})
    return list(groups.values())


def diverse_search_plan(store, expansions):
    last_seen = {}
    for row in store.list("story-search"):
        last_seen.setdefault(row["data"]["query"], row["data"].get("observed_at", ""))
    by_lane = {lane: sorted(queries, key=lambda q: last_seen.get(q, "")) for lane, queries in LANES.items()}
    # Rotate entire domains before taking another unused synonym in a domain
    # already reached. This still works when rate limits stop a batch early.
    lane_order = sorted(by_lane, key=lambda lane: max((last_seen.get(q, "") for q in LANES[lane]), default=""))
    exploration = [{"query": by_lane[lane][i], "origin": "bootstrap", "lane": lane, "topic_id": None}
                   for i in range(3) for lane in lane_order]
    plan = []
    # Two broad questions for every one evidence-anchored expansion. Reviewed
    # product-origin anecdotes cannot consume the entire next batch.
    while exploration or expansions:
        plan.extend(exploration[:2]);exploration = exploration[2:]
        if expansions:
            plan.append(expansions.pop(0))
    used = set()
    return [p for p in plan if not (p["query"] in used or used.add(p["query"]))]
