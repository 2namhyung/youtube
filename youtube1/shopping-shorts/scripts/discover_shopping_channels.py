"""Discover Korean shopping-Shorts channels and classify current-view outliers.

The Data API cannot confirm the Shorts surface or YouTube Shopping product tags.
Accordingly, this catalog records duration/keyword signals as probable and emits
only PROVISIONAL_CURRENT_VIEW_OUTLIER results until browser evidence is added.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sqlite3
import statistics
import sys
import time
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Iterable

import httpx


ROOT = Path(__file__).resolve().parents[1]
API_ROOT = "https://www.googleapis.com/youtube/v3"
DB_PATH = ROOT / "data" / "shopping-channel-catalog.sqlite3"
REPORT_ROOT = ROOT / "data" / "reports" / "shopping-channel-discovery"
DEFINITION = "youtube-public-current-views-2026-08-24-v1"
ACTIVE_WINDOW_DAYS = 90
ACTIVE_MIN_VIDEOS = 5

SEARCH_QUERY_GROUPS = {
    "paid_promotion": (
        "생활용품 추천 쇼츠", "주방용품 리뷰 쇼츠", "뷰티 제품 추천 쇼츠",
        "전자제품 추천 쇼츠", "패션 아이템 추천 쇼츠", "육아용품 리뷰 쇼츠",
        "반려동물 용품 쇼츠", "캠핑용품 리뷰 쇼츠", "건강식품 리뷰 쇼츠",
        "식품 추천 쇼츠",
    ),
    "shopping_tag": (
        "쇼핑하기 쇼츠", "제품 보기 쇼츠", "유튜브 쇼핑 제품 태그", "영상 속 제품 스티커",
        "쇼핑태그 추천템", "제품 태그 쇼츠", "유튜브쇼핑 추천템", "쇼핑 스티커 쇼츠",
    ),
    "general": (
        "쇼핑쇼츠", "유튜브 쇼핑", "쿠팡 추천템", "알리익스프레스 추천템", "다이소 추천템",
        "오늘의집 추천템", "추천템 쇼츠", "신박한 아이템", "인생템", "가성비 추천",
        "제품 리뷰 쇼츠", "언박싱 쇼츠", "내돈내산 쇼츠", "공동구매 추천", "핫딜 추천",
    ),
    "food": (
        "간식 추천", "편의점 신상", "식품 리뷰 쇼츠", "밀키트 추천", "냉동식품 추천",
        "건강식품 추천", "다이어트 간식 추천", "커피 추천템", "코스트코 식품 추천",
        "트레이더스 추천템", "마켓컬리 추천템", "온라인 장보기 추천",
    ),
    "household_goods": (
        "살림 꿀템", "생활 꿀템", "주방 꿀템", "청소 꿀템", "수납 꿀템", "욕실 꿀템",
        "세탁 꿀템", "다이소 살림템", "이케아 추천템", "오늘의집 살림템", "자취 꿀템",
        "신혼 살림템", "정리수납 추천템", "주방용품 추천", "생활용품 리뷰",
    ),
    "electronics": (
        "가전 추천템", "소형가전 추천", "디지털 추천템", "스마트폰 액세서리 추천",
        "아이폰 액세서리", "갤럭시 액세서리", "충전기 추천", "무선이어폰 추천",
        "키보드 추천 쇼츠", "로봇청소기 추천", "생활가전 리뷰", "IT 기기 리뷰",
        "테크 쇼츠", "컴퓨터 주변기기 추천",
    ),
    "beauty": (
        "올리브영 추천템", "화장품 추천", "메이크업 추천템", "스킨케어 추천",
        "향수 추천", "헤어제품 추천", "뷰티템 쇼츠", "다이소 화장품", "쿠팡 뷰티 추천",
    ),
    "fashion": (
        "패션 추천템", "데일리룩 쇼츠", "옷 추천 쇼츠", "가방 추천", "신발 추천",
        "코디 추천", "무신사 추천템", "지그재그 추천템", "에이블리 추천템",
    ),
    "parenting": (
        "육아 꿀템", "출산 준비물", "아기용품 추천", "유아용품 추천", "키즈 추천템",
        "장난감 추천", "엄마 추천템",
    ),
    "automotive_outdoor": (
        "차량용품 추천", "자동차 꿀템", "세차용품 추천", "캠핑용품 추천", "차박용품 추천",
        "등산용품 추천", "낚시용품 추천", "아웃도어 장비 추천",
    ),
    "health": (
        "영양제 추천", "건강기능식품 추천", "운동용품 추천", "홈트 기구 추천", "마사지기 추천",
    ),
    "pets": (
        "강아지 용품 추천", "고양이 용품 추천", "반려동물 꿀템", "펫용품 리뷰",
    ),
    "hobby_collectibles": (
        "문구 추천템", "다꾸 추천템", "산리오 언박싱", "피규어 언박싱", "키링 추천",
        "취미용품 추천", "블라인드박스 언박싱",
    ),
}
SEARCH_QUERIES = tuple(
    query for queries in SEARCH_QUERY_GROUPS.values() for query in queries
)
STRONG_COMMERCE_TERMS = (
    "추천템", "꿀템", "쇼핑", "쿠팡", "다이소", "내돈내산", "살림템", "주방템",
    "생활템", "공동구매", "공구", "핫딜", "특가", "최저가", "파트너스",
    "제품 링크", "상품 링크", "구매 링크", "프로필 링크", "affiliate",
)
WEAK_COMMERCE_TERMS = (
    "제품", "상품", "리뷰", "언박싱", "가성비", "아이템", "구매", "할인",
    "review", "unboxing",
)


class BudgetStop(RuntimeError):
    pass


class RemoteQuotaStop(RuntimeError):
    pass


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def next_quota_reset(at: datetime) -> datetime:
    """Documented PT midnight, including DST; allow one minute for reset."""
    pacific = at.astimezone(ZoneInfo("America/Los_Angeles"))
    midnight = (pacific + timedelta(days=1)).replace(hour=0, minute=1, second=0, microsecond=0)
    return midnight.astimezone(timezone.utc)


def batches(values: list[str], size: int = 50) -> Iterable[list[str]]:
    for offset in range(0, len(values), size):
        yield values[offset:offset + size]


def duration_seconds(value: str) -> int:
    import re
    match = re.fullmatch(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?", value or "")
    if not match:
        return 0
    days, hours, minutes, seconds = (int(part or 0) for part in match.groups())
    return days * 86400 + hours * 3600 + minutes * 60 + seconds


def commerce_signal(title: str, description: str) -> tuple[str, int]:
    text = f"{title}\n{description}".casefold()
    strong_hits = sum(1 for term in STRONG_COMMERCE_TERMS if term.casefold() in text)
    weak_hits = sum(1 for term in WEAK_COMMERCE_TERMS if term.casefold() in text)
    probable = strong_hits >= 1 or weak_hits >= 2
    return ("keyword_probable" if probable else "unknown", strong_hits + weak_hits)


def reclassify_stored_commerce(db: sqlite3.Connection) -> int:
    changed = 0
    for row in db.execute(
        "SELECT video_id,title,description,commerce_signal,commerce_keyword_hits FROM videos"
    ):
        signal, hits = commerce_signal(row["title"], row["description"])
        if signal != row["commerce_signal"] or hits != row["commerce_keyword_hits"]:
            db.execute(
                "UPDATE videos SET commerce_signal=?,commerce_keyword_hits=? WHERE video_id=?",
                (signal, hits, row["video_id"]),
            )
            changed += 1
    db.commit()
    return changed


class YouTube:
    def __init__(self, key: str, read_budget: int, search_budget: int = 100,
                 stats_budget: int = 10_000, *, backup_key: str = "", state_path=None, transport=None):
        self._keys = list(dict.fromkeys(k.strip() for k in (key, backup_key) if k.strip()))
        if not self._keys:
            raise ValueError("YouTube credential missing")
        self._active = 0
        self.state_path = Path(state_path) if state_path else None
        self.events = []
        self._cooldowns = {}
        self.budgets = {
            "read": read_budget,
            "search": search_budget,
            "stats": stats_budget,
        }
        self.used = {bucket: 0 for bucket in self.budgets}
        self.client = httpx.Client(timeout=45, transport=transport)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    @classmethod
    def from_environment(cls, read_budget, search_budget=100, stats_budget=10_000, *, state_path=None):
        return cls(os.environ.get("YOUTUBE_API_KEY", ""), read_budget, search_budget, stats_budget,
                   backup_key=os.environ.get("YOUTUBE_API_KEY_2", ""), state_path=state_path)

    def credential_status(self):
        return {"configured": len(self._keys), "active": "primary" if self._active == 0 else "backup",
                "failover": "invalid_or_expired_credential_only", "quota_rotation": False,
                "cooldowns": {bucket: {"retry_not_before": block["until"],
                    "reset_policy": block.get("reset_policy", "retry_after"),
                    "reason": block.get("reason") if block.get("reason") in {"daily_quota_exhausted", "rate_limited"} else "cooldown"}
                    for bucket, block in self._blocks().items() if datetime.fromisoformat(block["until"]) > datetime.now(timezone.utc)},
                "events": self.events}

    def _blocks(self):
        if not self.state_path or not self.state_path.exists():
            return self._cooldowns.copy()
        try:
            result = json.loads(self.state_path.read_text(encoding="utf-8"))
            if not isinstance(result, dict) or any(k not in self.budgets or not isinstance(v, dict) or "until" not in v for k, v in result.items()):
                raise ValueError()
            for value in result.values():
                if not isinstance(value["until"], str) or datetime.fromisoformat(value["until"]).tzinfo is None:
                    raise ValueError()
            migrated = False
            for value in result.values():
                if value.get("reason") == "daily_quota_exhausted" and not value.get("reset_policy"):
                    # Previous versions stored exactly failure time + 24 hours.
                    failed = datetime.fromisoformat(value["until"]) - timedelta(days=1)
                    value.update(blocked_at=failed.isoformat(), until=next_quota_reset(failed).isoformat(), reset_policy="pacific_midnight_plus_60s")
                    migrated = True
            if migrated:
                self._save_blocks(result)
            return result
        except (OSError, ValueError):
            raise RuntimeError("YouTube cooldown state is unreadable; inspect local state") from None

    def _block(self, bucket, seconds, reason):
        data = self._blocks()
        timestamp = datetime.now(timezone.utc)
        until = next_quota_reset(timestamp) if reason == "daily_quota_exhausted" else timestamp + timedelta(seconds=seconds)
        data[bucket] = {"until": until.isoformat(), "reason": reason, "blocked_at": timestamp.isoformat(),
                        "reset_policy": "pacific_midnight_plus_60s" if reason == "daily_quota_exhausted" else "retry_after"}
        self._save_blocks(data)
        self.events.append({"bucket": bucket, "reason": reason, "retry_not_before": data[bucket]["until"]})

    def _save_blocks(self, data):
        self._cooldowns = data
        if self.state_path:
            self.state_path.parent.mkdir(parents=True, exist_ok=True)
            temporary = self.state_path.with_suffix(f".{uuid.uuid4().hex}.tmp")
            temporary.write_text(json.dumps(data), encoding="utf-8")
            temporary.replace(self.state_path)

    def close(self):
        self.client.close()

    def get(self, endpoint: str, params: dict, cost: int = 1, bucket: str = "read") -> dict:
        if bucket not in self.budgets:
            raise ValueError(f"unknown quota bucket: {bucket}")
        block = self._blocks().get(bucket)
        if block and datetime.fromisoformat(block["until"]) > datetime.now(timezone.utc):
            raise RemoteQuotaStop(f"YouTube {bucket} cooldown until {block['until']}; no credential rotation")
        for attempt in range(3):
            if self.used[bucket] + cost > self.budgets[bucket]:
                raise BudgetStop(f"{bucket} quota budget reached ({self.used[bucket]}/{self.budgets[bucket]})")
            self.used[bucket] += cost
            try:
                response = self.client.get(f"{API_ROOT}/{endpoint}", params={**params, "key": self._keys[self._active]})
            except httpx.RequestError:
                if attempt == 2:
                    raise RuntimeError("YouTube Data API network failure") from None
                time.sleep(1 + attempt)
                continue
            status = response.status_code
            try:
                data = response.json()
            except ValueError:
                if 200 <= status < 300:
                    raise RuntimeError("YouTube Data API invalid JSON response") from None
                data = {}
            if 200 <= status < 300 and isinstance(data, dict) and "error" not in data:
                return data
            error = data.get("error", {}) if isinstance(data, dict) else {}
            error = error if isinstance(error, dict) else {}
            reasons = {str(e.get("reason", "")) for field in ("errors", "details")
                       for e in (error.get(field) if isinstance(error.get(field), list) else []) if isinstance(e, dict)}
            # Only expired/invalid credentials can fail over. Quota, rate limits,
            # permissions and service restrictions never trigger a second key.
            if reasons & {"keyInvalid", "keyExpired", "API_KEY_INVALID", "API_KEY_EXPIRED"}:
                if self._active + 1 < len(self._keys) and attempt < 2:
                    self._active += 1
                    self.events.append({"event": "credential_failover", "reason": "invalid_or_expired"})
                    continue
                raise RuntimeError("YouTube credential invalid or expired")
            if reasons & {"quotaExceeded", "dailyLimitExceeded", "DAILY_LIMIT_EXCEEDED"}:
                self._block(bucket, 86400, "daily_quota_exhausted")
                raise RemoteQuotaStop(f"YouTube {bucket} daily quota exhausted HTTP {status}; retry after Pacific midnight reset")
            if status == 429 or reasons & {"rateLimitExceeded", "userRateLimitExceeded", "RATE_LIMIT_EXCEEDED"}:
                retry = response.headers.get("Retry-After", "60")
                try:
                    seconds = max(1, int(retry)) if retry.isdigit() else max(1, int((parsedate_to_datetime(retry) - datetime.now(timezone.utc)).total_seconds()))
                except (TypeError, ValueError, OverflowError):
                    seconds = 60
                self._block(bucket, seconds, "rate_limited")
                raise RemoteQuotaStop(f"YouTube {bucket} rate limited HTTP {status}; retry after {seconds}s")
            if status >= 500 and attempt < 2:
                time.sleep(1 + attempt)
                continue
            # Never echo provider messages/URLs: they can contain credentials.
            raise RuntimeError(f"YouTube Data API HTTP {status}; permission_or_request_error") from None
        raise RuntimeError("YouTube Data API request failed")


def connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.executescript("""
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS channels(
      channel_id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
      country TEXT, uploads_playlist_id TEXT, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
      discovery_hits INTEGER NOT NULL DEFAULT 0, backfill_complete INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS search_hits(
      query TEXT NOT NULL, search_order TEXT NOT NULL, video_id TEXT NOT NULL,
      channel_id TEXT NOT NULL, observed_at TEXT NOT NULL,
      PRIMARY KEY(query, search_order, video_id)
    );
    CREATE TABLE IF NOT EXISTS search_query_runs(
      query TEXT PRIMARY KEY, category TEXT NOT NULL, last_run TEXT,
      run_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS videos(
      video_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '', published_at TEXT NOT NULL, duration_seconds INTEGER NOT NULL,
      views INTEGER, paid_product_placement INTEGER, shorts_status TEXT NOT NULL,
      commerce_signal TEXT NOT NULL, commerce_keyword_hits INTEGER NOT NULL,
      first_observed TEXT NOT NULL, last_observed TEXT NOT NULL, definition TEXT NOT NULL,
      last_stats_observed TEXT
    );
    CREATE INDEX IF NOT EXISTS videos_channel_idx ON videos(channel_id);
    CREATE TABLE IF NOT EXISTS metric_observations(
      video_id TEXT NOT NULL, observed_at TEXT NOT NULL, views INTEGER,
      definition TEXT NOT NULL, PRIMARY KEY(video_id, observed_at, definition)
    );
    """)
    channel_columns = {row[1] for row in db.execute("PRAGMA table_info(channels)")}
    if "next_page_token" not in channel_columns:
        db.execute("ALTER TABLE channels ADD COLUMN next_page_token TEXT")
    hit_columns = {row[1] for row in db.execute("PRAGMA table_info(search_hits)")}
    if "query_category" not in hit_columns:
        db.execute("ALTER TABLE search_hits ADD COLUMN query_category TEXT")
    if "video_title" not in hit_columns:
        db.execute("ALTER TABLE search_hits ADD COLUMN video_title TEXT NOT NULL DEFAULT ''")
    if "channel_title" not in hit_columns:
        db.execute("ALTER TABLE search_hits ADD COLUMN channel_title TEXT NOT NULL DEFAULT ''")
    if "published_at" not in hit_columns:
        db.execute("ALTER TABLE search_hits ADD COLUMN published_at TEXT")
    video_columns = {row[1] for row in db.execute("PRAGMA table_info(videos)")}
    if "last_stats_observed" not in video_columns:
        db.execute("ALTER TABLE videos ADD COLUMN last_stats_observed TEXT")
    for category, queries in SEARCH_QUERY_GROUPS.items():
        db.executemany(
            """INSERT INTO search_query_runs(query,category) VALUES(?,?)
               ON CONFLICT(query) DO UPDATE SET category=excluded.category""",
            ((query, category) for query in queries),
        )
    db.commit()
    return db


def select_search_queries(db: sqlite3.Connection, limit: int) -> list[sqlite3.Row]:
    """Return the least-recently-run category queries with fair category spread."""
    rows = db.execute("""
        SELECT query,category,last_run,run_count FROM search_query_runs
        ORDER BY CASE WHEN last_run IS NULL THEN 0 ELSE 1 END,
                 COALESCE(last_run,''), run_count, category, query
    """).fetchall()
    selected: list[sqlite3.Row] = []
    remaining = list(rows)
    while remaining and len(selected) < limit:
        used = {row["category"] for row in selected[-len(SEARCH_QUERY_GROUPS):]}
        index = next((i for i, row in enumerate(remaining) if row["category"] not in used), 0)
        selected.append(remaining.pop(index))
    return selected


def search_request_params(query: str, order: str, category: str) -> dict:
    params = {
        "part": "snippet", "q": query, "type": "video", "order": order,
        "regionCode": "KR", "relevanceLanguage": "ko", "videoDuration": "short",
        "maxResults": 50,
    }
    if category == "paid_promotion":
        params["videoPaidProductPlacement"] = "true"
    return params


def discover(api: YouTube, db: sqlite3.Connection, observed: str, search_calls: int = 32) -> set[str]:
    found: set[str] = set()
    for planned in select_search_queries(db, max(1, search_calls)):
        query = planned["query"]
        order = "date" if planned["run_count"] % 2 == 0 else "viewCount"
        try:
            params = search_request_params(query, order, planned["category"])
            data = api.get("search", params, bucket="search")
        except (BudgetStop, RemoteQuotaStop):
            break
        for item in data.get("items", []):
            video_id = item.get("id", {}).get("videoId")
            channel_id = item.get("snippet", {}).get("channelId")
            if not video_id or not channel_id:
                continue
            found.add(channel_id)
            snippet = item.get("snippet", {})
            db.execute("""INSERT INTO search_hits(
                            query,search_order,video_id,channel_id,observed_at,query_category,
                            video_title,channel_title,published_at
                          ) VALUES(?,?,?,?,?,?,?,?,?)
                          ON CONFLICT(query,search_order,video_id) DO UPDATE SET
                          channel_id=excluded.channel_id,observed_at=excluded.observed_at,
                          query_category=excluded.query_category,
                          video_title=excluded.video_title,channel_title=excluded.channel_title,
                          published_at=excluded.published_at""",
                       (query, order, video_id, channel_id, observed, planned["category"],
                        snippet.get("title", ""), snippet.get("channelTitle", ""),
                        snippet.get("publishedAt")))
        db.execute("""UPDATE search_query_runs SET last_run=?,run_count=run_count+1
                      WHERE query=?""", (observed, query))
        # Preserve every successful search call if a later query reaches the
        # provider's separate daily search-call limit.
        db.commit()
    for channel_id in found:
        hits = db.execute("SELECT COUNT(*) FROM search_hits WHERE channel_id=?", (channel_id,)).fetchone()[0]
        existing = db.execute("SELECT channel_id FROM channels WHERE channel_id=?", (channel_id,)).fetchone()
        if existing:
            db.execute("UPDATE channels SET last_seen=?,discovery_hits=? WHERE channel_id=?", (observed, hits, channel_id))
        else:
            db.execute("INSERT INTO channels(channel_id,first_seen,last_seen,discovery_hits) VALUES(?,?,?,?)",
                       (channel_id, observed, observed, hits))
    db.commit()
    return found


def hydrate_channels(api: YouTube, db: sqlite3.Connection, channel_ids: list[str], observed: str) -> None:
    for group in batches(channel_ids):
        data = api.get("channels", {"part": "snippet,contentDetails", "id": ",".join(group), "maxResults": 50})
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            uploads = item.get("contentDetails", {}).get("relatedPlaylists", {}).get("uploads")
            db.execute("""UPDATE channels SET title=?,description=?,country=?,uploads_playlist_id=?,last_seen=?
                          WHERE channel_id=?""",
                       (snippet.get("title", ""), snippet.get("description", ""), snippet.get("country"),
                        uploads, observed, item["id"]))
    db.commit()


def upload_pages(api: YouTube, playlist_id: str, full: bool, start_token: str | None = None):
    token = start_token
    while True:
        params = {"part": "contentDetails", "playlistId": playlist_id, "maxResults": 50}
        if token:
            params["pageToken"] = token
        data = api.get("playlistItems", params)
        ids = [item.get("contentDetails", {}).get("videoId") for item in data.get("items", [])]
        ids = [value for value in ids if value]
        next_token = data.get("nextPageToken")
        yield list(dict.fromkeys(ids)), next_token
        if not next_token or not full:
            return
        token = next_token


def store_videos(api: YouTube, db: sqlite3.Connection, video_ids: list[str], observed: str) -> int:
    stored = 0
    for group in batches(list(dict.fromkeys(video_ids))):
        data = api.get("videos", {
            "part": "snippet,contentDetails,statistics,paidProductPlacementDetails,status",
            "id": ",".join(group), "maxResults": 50,
        })
        for item in data.get("items", []):
            snippet = item.get("snippet", {})
            statistics_data = item.get("statistics", {})
            if not snippet.get("channelId") or not snippet.get("publishedAt"):
                continue
            seconds = duration_seconds(item.get("contentDetails", {}).get("duration", ""))
            signal, keyword_hits = commerce_signal(snippet.get("title", ""), snippet.get("description", ""))
            views = int(statistics_data["viewCount"]) if statistics_data.get("viewCount") is not None else None
            paid = item.get("paidProductPlacementDetails", {}).get("hasPaidProductPlacement")
            existing = db.execute("SELECT first_observed FROM videos WHERE video_id=?", (item["id"],)).fetchone()
            first_observed = existing[0] if existing else observed
            db.execute("""INSERT OR REPLACE INTO videos(
                            video_id,channel_id,title,description,published_at,duration_seconds,
                            views,paid_product_placement,shorts_status,commerce_signal,
                            commerce_keyword_hits,first_observed,last_observed,definition,
                            last_stats_observed
                          ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                item["id"], snippet["channelId"], snippet.get("title", ""), snippet.get("description", ""),
                snippet["publishedAt"], seconds, views, None if paid is None else int(bool(paid)),
                "probable" if 0 < seconds <= 180 else "not_short", signal, keyword_hits,
                first_observed, observed, DEFINITION, observed,
            ))
            db.execute("INSERT OR IGNORE INTO metric_observations VALUES(?,?,?,?)",
                       (item["id"], observed, views, DEFINITION))
            stored += 1
    db.commit()
    return stored


def refresh_video_statistics(api: YouTube, db: sqlite3.Connection, observed: str) -> dict:
    """Refresh counters through the dedicated batch statistics quota bucket."""
    video_ids = [row[0] for row in db.execute(
        """SELECT video_id FROM videos
           ORDER BY CASE WHEN last_stats_observed IS NULL THEN 0 ELSE 1 END,
                    COALESCE(last_stats_observed,''),video_id"""
    ).fetchall()]
    refreshed = failed = 0
    truncated = False
    for group in batches(video_ids):
        try:
            data = api.get("videos:batchGetStats", {
                "part": "snippet,contentDetails,statistics",
                "id": ",".join(group),
            }, bucket="stats")
        except (BudgetStop, RemoteQuotaStop):
            truncated = True
            break
        returned_ids = set()
        for item in data.get("items", []):
            video_id = item.get("id")
            if not video_id:
                continue
            returned_ids.add(video_id)
            stats = item.get("statistics", {})
            views = int(stats["viewCount"]) if stats.get("viewCount") is not None else None
            content = item.get("contentDetails", {})
            millis = content.get("durationMillis")
            seconds = int(round(int(millis) / 1000)) if millis is not None else None
            if seconds is None:
                db.execute(
                    "UPDATE videos SET views=?,last_stats_observed=? WHERE video_id=?",
                    (views, observed, video_id),
                )
            else:
                db.execute(
                    """UPDATE videos SET views=?,duration_seconds=?,shorts_status=?,
                       last_stats_observed=? WHERE video_id=?""",
                    (views, seconds, "probable" if 0 < seconds <= 180 else "not_short",
                     observed, video_id),
                )
            db.execute(
                "INSERT OR IGNORE INTO metric_observations VALUES(?,?,?,?)",
                (video_id, observed, views, DEFINITION),
            )
            refreshed += 1
        summary = data.get("summary", {})
        failed += len(summary.get("failedVideoIds", []))
        failed += len(set(group) - returned_ids - set(summary.get("failedVideoIds", [])))
        db.commit()
    return {"stats_refreshed": refreshed, "stats_failed": failed,
            "stats_budget_truncated": truncated}


def refresh_stale_metadata(api: YouTube, db: sqlite3.Connection, observed: str,
                           max_age_days: int = 25) -> int:
    """Refresh only metadata nearing YouTube's 30-day stored-data limit."""
    cutoff = (datetime.now(timezone.utc) - timedelta(days=max_age_days)).isoformat()
    video_ids = [row[0] for row in db.execute(
        "SELECT video_id FROM videos WHERE last_observed < ? ORDER BY video_id", (cutoff,)
    ).fetchall()]
    return store_videos(api, db, video_ids, observed)


def refresh(api: YouTube, db: sqlite3.Connection, observed: str, full_backfill: bool) -> dict:
    channels = db.execute("""
        SELECT c.*, COUNT(v.video_id) AS catalogued_videos
        FROM channels c LEFT JOIN videos v ON v.channel_id=c.channel_id
        WHERE c.uploads_playlist_id IS NOT NULL
        GROUP BY c.channel_id
        ORDER BY CASE WHEN COUNT(v.video_id)=0 THEN 0 ELSE 1 END,
                 c.backfill_complete, c.discovery_hits DESC, c.channel_id
    """).fetchall()
    refreshed = completed = 0
    truncated = False
    for channel in channels:
        has_sample = int(channel["catalogued_videos"] or 0) > 0
        full = full_backfill or (has_sample and not bool(channel["backfill_complete"]))
        start_token = None if full_backfill or channel["backfill_complete"] else channel["next_page_token"]
        try:
            is_complete = False
            for ids, next_token in upload_pages(api, channel["uploads_playlist_id"], full, start_token):
                store_videos(api, db, ids, observed)
                is_complete = not next_token
                db.execute("UPDATE channels SET next_page_token=? WHERE channel_id=?",
                           (next_token, channel["channel_id"]))
                db.commit()
        except (BudgetStop, RemoteQuotaStop):
            truncated = True
            break
        refreshed += 1
        if is_complete:
            db.execute("UPDATE channels SET backfill_complete=1,next_page_token=NULL,last_seen=? WHERE channel_id=?",
                       (observed, channel["channel_id"]))
            completed += 1
        db.commit()

    metadata_refreshed = 0
    if not truncated:
        try:
            metadata_refreshed = refresh_stale_metadata(api, db, observed)
        except (BudgetStop, RemoteQuotaStop):
            truncated = True
    stats_result = refresh_video_statistics(api, db, observed)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    db.execute("DELETE FROM metric_observations WHERE observed_at < ?", (cutoff,))
    db.execute("DELETE FROM videos WHERE last_observed < ?", (cutoff,))
    db.commit()
    return {
        "channels_refreshed": refreshed,
        "channels_backfill_completed": completed,
        "metadata_refreshed": metadata_refreshed,
        "budget_truncated": truncated,
        **stats_result,
    }


def active_channel_video_counts(db: sqlite3.Connection, observed_at: str) -> dict[str, int]:
    cutoff = (datetime.fromisoformat(observed_at) - timedelta(days=ACTIVE_WINDOW_DAYS)).isoformat()
    return {
        row["channel_id"]: row["video_count"]
        for row in db.execute(
            """SELECT channel_id,COUNT(*) AS video_count FROM videos
               WHERE datetime(published_at) >= datetime(?)
               GROUP BY channel_id""",
            (cutoff,),
        ).fetchall()
    }


def classify(db: sqlite3.Connection, observed_at: str | None = None) -> tuple[list[dict], list[dict]]:
    observed_at = observed_at or utcnow()
    recent_counts = active_channel_video_counts(db, observed_at)
    channel_rows = []
    outliers = []
    for channel in db.execute("SELECT * FROM channels ORDER BY discovery_hits DESC").fetchall():
        recent_video_count = recent_counts.get(channel["channel_id"], 0)
        if recent_video_count < ACTIVE_MIN_VIDEOS:
            continue
        videos = [dict(row) for row in db.execute(
            """SELECT * FROM videos WHERE channel_id=? AND shorts_status='probable'
               AND commerce_signal='keyword_probable' AND views IS NOT NULL""", (channel["channel_id"],)).fetchall()]
        values = [video["views"] for video in videos]
        median_views = statistics.median(values) if values else None
        logs = [math.log1p(value) for value in values]
        log_median = statistics.median(logs) if logs else None
        mad = statistics.median(abs(value - log_median) for value in logs) if logs else None
        probable = len(videos) >= 3
        channel_rows.append({
            "channel_id": channel["channel_id"], "title": channel["title"],
            "discovery_hits": channel["discovery_hits"], "catalogued_videos": db.execute(
                "SELECT COUNT(*) FROM videos WHERE channel_id=?", (channel["channel_id"],)).fetchone()[0],
            "probable_shopping_shorts": len(videos), "shopping_channel_probable": probable,
            "backfill_complete": bool(channel["backfill_complete"]), "median_views": median_views,
            "recent_90d_videos": recent_video_count,
        })
        if len(values) < 10 or not median_views:
            continue
        for video in videos:
            lift = video["views"] / median_views
            robust_z = None if not mad else 0.6745 * (math.log1p(video["views"]) - log_median) / mad
            is_outlier = video["views"] >= 50_000 and lift >= 10 and (robust_z is None or robust_z >= 3.5)
            if is_outlier:
                outliers.append({
                    "status": "PROVISIONAL_CURRENT_VIEW_OUTLIER",
                    "channel_id": channel["channel_id"], "channel_title": channel["title"],
                    "video_id": video["video_id"], "title": video["title"],
                    "url": f"https://www.youtube.com/watch?v={video['video_id']}",
                    "published_at": video["published_at"], "views": video["views"],
                    "channel_median_views": median_views, "lift": round(lift, 2),
                    "log_mad_robust_z": None if robust_z is None else round(robust_z, 2),
                    "sample_count": len(values), "upload_age_ignored": True,
                    "shorts_status": "probable", "commerce_status": "keyword_probable",
                    "shopping_tag_status": "unknown", "definition": DEFINITION,
                })
    outliers.sort(key=lambda item: (item["lift"], item["views"]), reverse=True)
    channel_rows.sort(key=lambda item: (item["shopping_channel_probable"], item["probable_shopping_shorts"], item["discovery_hits"]), reverse=True)
    return channel_rows, outliers


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--discover", action="store_true")
    parser.add_argument("--discover-if-stale-days", type=int)
    parser.add_argument("--full-backfill", action="store_true")
    parser.add_argument("--classify-only", action="store_true")
    parser.add_argument("--stats-only", action="store_true")
    parser.add_argument("--quota-budget", type=int, default=8200)
    parser.add_argument("--search-budget", type=int, default=100)
    parser.add_argument("--stats-budget", type=int, default=10_000)
    parser.add_argument("--search-calls", type=int, default=32)
    args = parser.parse_args()
    key = os.environ.get("YOUTUBE_API_KEY")
    if not key and not args.classify_only:
        raise RuntimeError("YOUTUBE_API_KEY is not configured")
    observed = utcnow()
    db = connect()
    api = YouTube(key or "unused", args.quota_budget, args.search_budget, args.stats_budget,
                  backup_key=os.environ.get("YOUTUBE_API_KEY_2", ""), state_path=ROOT / "data" / "youtube-cooldowns.json")
    discovery_ran = args.discover
    if args.discover_if_stale_days is not None:
        latest = db.execute("SELECT MAX(observed_at) FROM search_hits").fetchone()[0]
        discovery_ran = not latest or datetime.fromisoformat(latest) < datetime.now(timezone.utc) - timedelta(days=args.discover_if_stale_days)
    try:
        if args.classify_only:
            discovery_ran = False
            refresh_result = {
                "channels_refreshed": 0, "channels_backfill_completed": 0,
                "metadata_refreshed": 0, "stats_refreshed": 0, "stats_failed": 0,
                "budget_truncated": False, "stats_budget_truncated": False,
            }
        elif args.stats_only:
            discovery_ran = False
            refresh_result = {
                "channels_refreshed": 0, "channels_backfill_completed": 0,
                "metadata_refreshed": 0, "budget_truncated": False,
                **refresh_video_statistics(api, db, observed),
            }
        else:
            if discovery_ran:
                discover(api, db, observed, args.search_calls)
            ids = [row[0] for row in db.execute("SELECT channel_id FROM channels ORDER BY discovery_hits DESC").fetchall()]
            hydration_truncated = False
            try:
                hydrate_channels(api, db, ids, observed)
            except (BudgetStop, RemoteQuotaStop):
                hydration_truncated = True
            refresh_result = refresh(api, db, observed, args.full_backfill)
            refresh_result["budget_truncated"] = (
                hydration_truncated or refresh_result["budget_truncated"]
            )
        reclassify_stored_commerce(db)
        channels, outliers = classify(db, observed)
        catalogued_channels_total = db.execute("SELECT COUNT(*) FROM channels").fetchone()[0]
        sampled_channels_total = db.execute(
            "SELECT COUNT(DISTINCT channel_id) FROM videos"
        ).fetchone()[0]
        report = {
            "schema": "shopping-channel-outlier-catalog-v1", "observed_at": observed,
            "definition": DEFINITION, "discovery_ran": discovery_ran,
            "quota_usage": {
                bucket: {"used": api.used[bucket], "budget": api.budgets[bucket]}
                for bucket in api.budgets
            },
            "search_queries_catalogued": len(SEARCH_QUERIES),
            "search_queries_run": db.execute(
                "SELECT COUNT(*) FROM search_query_runs WHERE last_run=?", (observed,)
            ).fetchone()[0],
            "search_categories_run": [row[0] for row in db.execute(
                """SELECT DISTINCT category FROM search_query_runs WHERE last_run=?
                   ORDER BY category""", (observed,)
            ).fetchall()],
            "channels_catalogued_total": catalogued_channels_total,
            "channels_total": len(channels),
            "channels_excluded_by_activity_filter": catalogued_channels_total - len(channels),
            "channels_without_video_sample": catalogued_channels_total - sampled_channels_total,
            "sampled_channels_below_activity_minimum": sampled_channels_total - len(channels),
            "activity_filter": {
                "window_days": ACTIVE_WINDOW_DAYS,
                "minimum_videos": ACTIVE_MIN_VIDEOS,
                "cutoff_at": (
                    datetime.fromisoformat(observed) - timedelta(days=ACTIVE_WINDOW_DAYS)
                ).isoformat(),
            },
            "probable_shopping_channels": sum(1 for item in channels if item["shopping_channel_probable"]),
            "videos_total": db.execute("SELECT COUNT(*) FROM videos").fetchone()[0],
            "probable_shopping_shorts": db.execute(
                "SELECT COUNT(*) FROM videos WHERE shorts_status='probable' AND commerce_signal='keyword_probable'").fetchone()[0],
            "provisional_outliers": len(outliers), **refresh_result,
            "limitations": [
                "YouTube Data API does not confirm the Shorts surface or expose public Shopping product tags.",
                "Commerce is a keyword discovery signal until Chrome/Luna evidence confirms it.",
                "Current cumulative views are compared across all upload ages, as requested; age can influence results.",
                "Channels with fewer than 5 catalogued uploads in the last 90 days are excluded.",
            ],
            "top_channels": channels[:200], "outliers": outliers[:500],
        }
        REPORT_ROOT.mkdir(parents=True, exist_ok=True)
        history = REPORT_ROOT / "history"
        history.mkdir(exist_ok=True)
        rendered = json.dumps(report, ensure_ascii=False, indent=2)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        (history / f"{stamp}.json").write_text(rendered, encoding="utf-8")
        (REPORT_ROOT / "latest.json").write_text(rendered, encoding="utf-8")
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        print(json.dumps({key: value for key, value in report.items() if key not in {"top_channels", "outliers", "limitations"}}, ensure_ascii=False, indent=2))
        print(json.dumps({"top_outliers": outliers[:20]}, ensure_ascii=False, indent=2))
        return 0
    finally:
        api.close()
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
