"""Classify probable Korean shopping-Shorts channels with browser observations.

The YouTube Data API provides the catalog used for category and specialization
signals.  A browser observation of YouTube's ``제품 보기`` button is the only
positive Shopping-tag evidence used here; a missing button is recorded as
``not_observed`` rather than proof that a tag does not exist.
"""
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "shopping-channel-catalog.sqlite3"
REPORT_ROOT = ROOT / "data" / "reports" / "shopping-channel-classification"
OBSERVATIONS_PATH = REPORT_ROOT / "browser-observations.json"

CATEGORIES = {
    "food": (
        "식품", "음식", "간식", "과자", "라면", "음료", "커피", "먹방", "맛집", "요리",
        "밀키트", "레시피", "디저트", "빵", "고기", "과일", "편의점", "푸드",
    ),
    "household_goods": (
        "살림", "주방", "청소", "수납", "욕실", "세탁", "다이소", "생활용품", "생활템",
        "정리", "가구", "인테리어", "냄비", "프라이팬", "텀블러", "휴지", "그릇",
    ),
    "electronics": (
        "전자", "충전", "스마트폰", "아이폰", "갤럭시", "이어폰", "헤드폰", "노트북",
        "컴퓨터", "키보드", "마우스", "가전", "로봇청소기", "카메라", "모니터", "usb",
        "블루투스", "테크", "전동", "배터리",
    ),
    "beauty": (
        "화장품", "메이크업", "스킨", "립", "뷰티", "향수", "핸드크림", "헤어", "샴푸",
        "선크림", "마스크팩", "올리브영", "네일", "피부",
    ),
    "fashion": (
        "패션", "옷", "의류", "신발", "가방", "코디", "액세서리", "주얼리", "ootd",
        "운동화", "아우터", "바지", "원피스", "모자",
    ),
    "parenting": (
        "육아", "아기", "유아", "어린이", "키즈", "출산", "임신", "아이템", "장난감",
    ),
    "automotive_outdoor": (
        "차량", "자동차", "캠핑", "등산", "아웃도어", "차박", "텐트", "낚시", "세차",
    ),
    "hobby_collectibles": (
        "산리오", "랜덤깡", "피규어", "다꾸", "문구", "블라인드박스", "키링", "굿즈",
        "레고", "포토카드", "인형", "캐릭터",
    ),
    "health": (
        "건강", "운동", "영양제", "마사지", "의료", "헬스", "다이어트", "비타민", "단백질",
    ),
    "pets": (
        "강아지", "고양이", "반려동물", "반려견", "반려묘", "펫용품", "사료", "배변패드",
    ),
}

CATEGORY_LABELS = {
    "food": "음식·식품",
    "household_goods": "생활·주방용품",
    "electronics": "전자제품·가전",
    "beauty": "뷰티",
    "fashion": "패션",
    "parenting": "육아용품",
    "automotive_outdoor": "자동차·캠핑",
    "hobby_collectibles": "취미·문구·굿즈",
    "health": "건강·운동",
    "pets": "반려동물용품",
    "mixed_other": "종합·기타",
}

AUDIT_STRONG_TERMS = (
    "쇼핑", "추천템", "꿀템", "살림템", "주방템", "육아템", "캠핑용품", "생활용품",
    "공동구매", "공구", "쿠팡", "다이소", "제품 링크", "상품 링크", "구매 링크",
    "프로필 링크", "최저가", "특가", "핫딜", "파트너스",
)

# These describe many ordinary entertainment/review Shorts.  They lower the
# browser-audit priority only when no explicit shopping-intent phrase exists.
AUDIT_AMBIGUOUS_TERMS = (
    "랭킹", "웃긴", "먹방", "데일리룩", "ootd", "골프", "댄스", "언박싱", "리뷰",
)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_observations(path: Path) -> list[dict]:
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return data.get("observations", data) if isinstance(data, dict) else data


def keyword_scores(channel: sqlite3.Row, videos: list[sqlite3.Row]) -> Counter:
    scores: Counter = Counter()
    # Channel identity is a strong, but single, signal.
    channel_text = f"{channel['title']} {channel['description']}".casefold()
    for category, terms in CATEGORIES.items():
        scores[category] += 3 * sum(term.casefold() in channel_text for term in terms)

    # Cap each term to one vote per video so repeated affiliate boilerplate does
    # not overwhelm the actual product mix.
    for video in videos:
        text = f"{video['title']} {video['description']}".casefold()
        for category, terms in CATEGORIES.items():
            scores[category] += sum(term.casefold() in text for term in terms)
    return scores


def category_result(scores: Counter) -> tuple[str, list[dict]]:
    ranked = sorted(scores.items(), key=lambda pair: (-pair[1], pair[0]))
    ranked = [(key, value) for key, value in ranked if value > 0]
    if not ranked:
        return "mixed_other", []
    primary, top = ranked[0]
    # Closely split catalogs are more accurately described as mixed.
    if len(ranked) > 1 and ranked[1][1] >= top * 0.8 and ranked[1][1] >= 5:
        primary = "mixed_other"
    return primary, [
        {"category": key, "label": CATEGORY_LABELS[key], "score": value}
        for key, value in ranked[:3]
    ]


def audit_priority(channel: sqlite3.Row, candidate_data: list[dict], specialist: bool,
                   shopping_count: int, query_precision: float | None = None,
                   query_audited: int = 0, shopping_tag_query: bool = False) -> tuple[int, list[str]]:
    text = " ".join([
        str(channel["title"] or ""),
        str(channel["description"] or ""),
        *(str(item.get("title") or "") for item in candidate_data),
    ]).casefold()
    strong_hits = sum(term.casefold() in text for term in AUDIT_STRONG_TERMS)
    ambiguous_hits = sum(term.casefold() in text for term in AUDIT_AMBIGUOUS_TERMS)
    score = min(int(channel["discovery_hits"] or 0), 20)
    score += min(shopping_count, 30)
    score += 25 if specialist else 0
    score += strong_hits * 12
    if query_precision is not None and query_audited >= 3:
        score += round((query_precision - 0.5) * 80)
    if shopping_tag_query:
        score += 30
    if not strong_hits:
        score -= ambiguous_hits * 10
    reasons = []
    if specialist:
        reasons.append("catalog-specialist")
    if strong_hits:
        reasons.append(f"explicit-shopping-phrases:{strong_hits}")
    if ambiguous_hits and not strong_hits:
        reasons.append(f"ambiguous-content-penalty:{ambiguous_hits}")
    if query_precision is not None and query_audited >= 3:
        reasons.append(f"audited-query-precision:{query_precision:.2f}/{query_audited}")
    if shopping_tag_query:
        reasons.append("direct-shopping-tag-query")
    if not candidate_data:
        score -= 50
        reasons.append("no-video-candidate")
    return score, reasons


def build(db: sqlite3.Connection, observations: list[dict]) -> tuple[list[dict], list[dict]]:
    by_channel: dict[str, list[dict]] = {}
    for item in observations:
        by_channel.setdefault(item["channel_id"], []).append(item)

    channel_truth = {
        channel_id: "positive" if any(x.get("shopping_tag_visible") is True for x in seen) else "negative"
        for channel_id, seen in by_channel.items()
    }
    query_channels: dict[str, set[str]] = {}
    channel_queries: dict[str, list[tuple[str, str | None]]] = {}
    for hit in db.execute("SELECT DISTINCT query,query_category,channel_id FROM search_hits"):
        query_channels.setdefault(hit["query"], set()).add(hit["channel_id"])
        channel_queries.setdefault(hit["channel_id"], []).append((hit["query"], hit["query_category"]))
    query_evidence: dict[str, tuple[float, int]] = {}
    for query, discovered in query_channels.items():
        positive = sum(channel_truth.get(channel_id) == "positive" for channel_id in discovered)
        negative = sum(channel_truth.get(channel_id) == "negative" for channel_id in discovered)
        audited = positive + negative
        # Beta(1,1) smoothing avoids over-promoting a query from one lucky hit.
        query_evidence[query] = ((positive + 1) / (audited + 2), audited)

    rows: list[dict] = []
    queue: list[dict] = []
    channels = db.execute("""
        SELECT c.*,
               COUNT(v.video_id) AS catalogued_videos,
               SUM(CASE WHEN v.shorts_status='probable' THEN 1 ELSE 0 END) AS probable_shorts,
               SUM(CASE WHEN v.shorts_status='probable' AND v.commerce_signal='keyword_probable'
                        THEN 1 ELSE 0 END) AS shopping_shorts
        FROM channels c LEFT JOIN videos v ON v.channel_id=c.channel_id
        GROUP BY c.channel_id
        ORDER BY shopping_shorts DESC, c.discovery_hits DESC
    """).fetchall()

    for channel in channels:
        videos = db.execute("""
            SELECT * FROM videos WHERE channel_id=? AND shorts_status='probable'
            ORDER BY published_at DESC
        """, (channel["channel_id"],)).fetchall()
        shopping = [v for v in videos if v["commerce_signal"] == "keyword_probable"]
        shorts_count = int(channel["probable_shorts"] or 0)
        shopping_count = int(channel["shopping_shorts"] or 0)
        ratio = shopping_count / shorts_count if shorts_count else 0.0
        specialist = (
            (shopping_count >= 10 and ratio >= 0.60)
            or (shopping_count >= 5 and ratio >= 0.80)
        )

        scores = keyword_scores(channel, shopping or videos)
        primary, ranked_categories = category_result(scores)
        seen = by_channel.get(channel["channel_id"], [])
        positives = [x for x in seen if x.get("shopping_tag_visible") is True]
        tag_status = "confirmed" if positives else ("not_observed" if seen else "uninspected")
        sample_minimum = sum(int(x.get("sample_count_min", 1)) for x in seen)
        sample_maximum = sum(int(x.get("sample_count_max", x.get("sample_count_min", 1))) for x in seen)
        tagged_video_ids = []
        for item in positives:
            if item.get("video_id"):
                tagged_video_ids.append(item["video_id"])
            tagged_video_ids.extend(item.get("tagged_sample_video_ids", []))

        if specialist and tag_status == "confirmed":
            classification = "CONFIRMED_TAGGED_SHOPPING_SPECIALIST"
        elif tag_status == "confirmed":
            classification = "CONFIRMED_TAGGED_SHOPPING_CHANNEL"
        elif specialist:
            classification = "PROBABLE_SHOPPING_SPECIALIST_TAG_NOT_CONFIRMED"
        elif not videos and tag_status == "uninspected":
            classification = "UNINSPECTED_DISCOVERY_HIT"
        elif not videos:
            classification = "TAG_NOT_OBSERVED_DISCOVERY_SAMPLE"
        else:
            classification = "MIXED_OR_INSUFFICIENT_SHOPPING_CHANNEL"

        candidates: list[sqlite3.Row] = []
        if shopping:
            candidates.append(max(shopping, key=lambda v: (v["published_at"], v["views"] or 0)))
            highest = max(shopping, key=lambda v: (v["views"] or 0, v["published_at"]))
            if highest["video_id"] != candidates[0]["video_id"]:
                candidates.append(highest)
        elif videos:
            candidates.append(max(videos, key=lambda v: (v["published_at"], v["views"] or 0)))
            highest = max(videos, key=lambda v: (v["views"] or 0, v["published_at"]))
            if highest["video_id"] != candidates[0]["video_id"]:
                candidates.append(highest)
        candidate_data = [{
            "video_id": v["video_id"], "title": v["title"], "views": v["views"],
            "published_at": v["published_at"],
            "url": f"https://www.youtube.com/watch?v={v['video_id']}",
        } for v in candidates]
        if not candidate_data:
            search_ids = db.execute("""
                SELECT video_id,video_title,published_at FROM search_hits WHERE channel_id=?
                ORDER BY observed_at DESC, video_id LIMIT 2
            """, (channel["channel_id"],)).fetchall()
            candidate_data = [{
                "video_id": item["video_id"], "title": item["video_title"], "views": None,
                "published_at": item["published_at"],
                "url": f"https://www.youtube.com/shorts/{item['video_id']}",
                "candidate_source": "search_hit",
            } for item in search_ids]

        row = {
            "channel_id": channel["channel_id"],
            "channel_title": channel["title"],
            "channel_url": f"https://www.youtube.com/channel/{channel['channel_id']}/shorts",
            "classification": classification,
            "shopping_specialist_probable": specialist,
            "shopping_tag_status": tag_status,
            "browser_samples_checked_minimum": sample_minimum,
            "browser_samples_checked_maximum": sample_maximum,
            "tagged_sample_video_ids": list(dict.fromkeys(tagged_video_ids)),
            "catalogued_videos": int(channel["catalogued_videos"] or 0),
            "probable_shorts": shorts_count,
            "keyword_probable_shopping_shorts": shopping_count,
            "shopping_short_ratio": round(ratio, 4),
            "backfill_complete": bool(channel["backfill_complete"]),
            "primary_category": primary,
            "primary_category_label": CATEGORY_LABELS[primary],
            "category_scores": ranked_categories,
            "browser_candidates": candidate_data,
        }
        rows.append(row)
        if tag_status == "uninspected":
            discovered_by = channel_queries.get(channel["channel_id"], [])
            evidenced_queries = [
                query_evidence[query] for query, _ in discovered_by
                if query_evidence.get(query, (0.0, 0))[1] >= 3
            ]
            best_precision, best_audited = max(
                evidenced_queries, key=lambda item: (item[0], item[1]), default=(None, 0)
            )
            has_shopping_tag_query = any(category == "shopping_tag" for _, category in discovered_by)
            priority_score, priority_reasons = audit_priority(
                channel, candidate_data, specialist, shopping_count,
                best_precision, best_audited, has_shopping_tag_query,
            )
            queue.append({
                "channel_id": channel["channel_id"],
                "channel_title": channel["title"],
                "candidates": candidate_data,
                "priority_score": priority_score,
                "priority_reasons": priority_reasons,
            })

    rows.sort(key=lambda x: (
        x["shopping_tag_status"] == "confirmed",
        x["shopping_specialist_probable"],
        x["keyword_probable_shopping_shorts"],
    ), reverse=True)
    queue.sort(key=lambda x: (x["priority_score"], len(x["candidates"])), reverse=True)
    return rows, queue


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DB_PATH)
    parser.add_argument("--observations", type=Path, default=OBSERVATIONS_PATH)
    args = parser.parse_args()

    db = sqlite3.connect(args.db)
    db.row_factory = sqlite3.Row
    try:
        observations = load_observations(args.observations)
        channels, queue = build(db, observations)
    finally:
        db.close()

    REPORT_ROOT.mkdir(parents=True, exist_ok=True)
    category_counts = Counter(row["primary_category"] for row in channels)
    report = {
        "schema": "shopping-channel-browser-classification-v1",
        "generated_at": now(),
        "method": {
            "catalog": "YouTube Data API title/description/duration/current view data",
            "tag_evidence": "Chrome YouTube watch page accessible button named 제품 보기",
            "tag_absence_policy": "not_observed is sample-limited and is not proof of absence",
            "browser_actor": "Codex computer-use browser audit",
        },
        "summary": {
            "candidate_channels": len(channels),
            "catalogued_channels": sum(x["catalogued_videos"] > 0 for x in channels),
            "channels_without_catalog_sample": sum(x["catalogued_videos"] == 0 for x in channels),
            "shopping_specialists_probable": sum(x["shopping_specialist_probable"] for x in channels),
            "tag_confirmed_channels": sum(x["shopping_tag_status"] == "confirmed" for x in channels),
            "tag_not_observed_channels": sum(x["shopping_tag_status"] == "not_observed" for x in channels),
            "uninspected_channels": sum(x["shopping_tag_status"] == "uninspected" for x in channels),
            "category_counts": dict(category_counts),
        },
        "channels": channels,
    }
    (REPORT_ROOT / "latest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (REPORT_ROOT / "browser-queue.json").write_text(json.dumps({"channels": queue}, ensure_ascii=False, indent=2), encoding="utf-8")
    with (REPORT_ROOT / "classified-channels.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=(
            "channel_title", "channel_id", "channel_url", "classification",
            "shopping_tag_status", "primary_category_label", "catalogued_videos",
            "probable_shorts", "keyword_probable_shopping_shorts", "shopping_short_ratio",
            "backfill_complete",
        ))
        writer.writeheader()
        for channel in channels:
            writer.writerow({key: channel[key] for key in writer.fieldnames})

    lines = [
        "# 쇼핑쇼츠 채널 분류",
        "",
        f"생성 시각: {report['generated_at']}",
        "",
        f"- 후보 채널: {report['summary']['candidate_channels']}",
        f"- 쇼핑 전문 가능성이 높은 채널: {report['summary']['shopping_specialists_probable']}",
        f"- Chrome에서 쇼핑 태그 확인: {report['summary']['tag_confirmed_channels']}",
        f"- 대표 표본에서 태그 미관찰: {report['summary']['tag_not_observed_channels']}",
        "",
        "## 태그가 확인된 쇼핑 전문 채널",
        "",
        "| 채널 | 상품군 | 쇼핑성 쇼츠 | 비율 |",
        "|---|---:|---:|---:|",
    ]
    for channel in channels:
        if channel["classification"] != "CONFIRMED_TAGGED_SHOPPING_SPECIALIST":
            continue
        title = channel["channel_title"].replace("|", "\\|")
        lines.append(
            f"| [{title}]({channel['channel_url']}) | {channel['primary_category_label']} | "
            f"{channel['keyword_probable_shopping_shorts']:,} | {channel['shopping_short_ratio']:.1%} |"
        )
    lines.extend((
        "",
        "> `미관찰`은 태그가 없다는 뜻이 아니라, 선택한 대표 영상 최대 2개에서 보이지 않았다는 뜻입니다.",
    ))
    (REPORT_ROOT / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
