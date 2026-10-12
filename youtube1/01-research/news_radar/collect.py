from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import os
import re
import sqlite3
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Iterable

from backfill import HistoricalRecord, clamp_days as clamp_backfill_days, crawl_historical_source, parse_timestamp


BASE_DIR = Path(__file__).resolve().parent
USER_AGENT = "NewsRadar/1.0 (personal topic research; metadata only)"
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")
MAX_INGESTED_FEED_EXCERPT_CHARS = 1_200
MAX_LOOKBACK_DAYS = 30
DEFAULT_LOOKBACK_DAYS = 30
DEFAULT_ARTICLE_POOL_LIMIT = 3_000
DEFAULT_DAILY_ARTICLE_LIMIT = 100
POOL_TIMEZONE = timezone(timedelta(hours=9))
TITLE_NOISE_RE = re.compile(r"\[(?:영상|포토|단독|속보|종합|현장|르포)[^\]]*\]")
ALLOWED_SECRET_NAMES = frozenset({
    "NAVER_API_HUB_CLIENT_ID", "NAVER_API_HUB_CLIENT_SECRET",
    "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET",
    "KAKAO_REST_API_KEY", "KAKAO_API_KEY",
})
DOTENV_MAX_BYTES = 64 * 1024
PROJECT_ENV_PATH = BASE_DIR.parents[2] / ".env"


@dataclass
class Article:
    source: str
    title: str
    url: str
    published_at: str
    collected_at: str
    score: int = 0
    fear: int = 0
    frustration: int = 0
    absurd: int = 0
    everyday: int = 0
    visual: int = 0
    excluded: int = 0
    matched_keywords: str = ""
    signal_text: str = ""
    provenance: str = "rss-description-or-atom-summary"

    @property
    def article_id(self) -> str:
        raw = canonical_url(self.url)
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def clean_text(value: str | None) -> str:
    value = html.unescape(value or "")
    value = TAG_RE.sub(" ", value)
    return SPACE_RE.sub(" ", value).strip()


def normalize_title(title: str) -> str:
    title = TITLE_NOISE_RE.sub(" ", clean_text(title)).lower()
    title = re.sub(r"[^0-9a-z가-힣]+", "", title)
    return title


def canonical_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url.strip())
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    query = [(k, v) for k, v in query if not k.lower().startswith(("utm_", "ref", "fbclid"))]
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc.lower(), parsed.path, urllib.parse.urlencode(query), ""))


def _parse_dotenv_value(raw: str) -> str | None:
    value = raw.strip()
    if not value:
        return ""
    if value.startswith('"'):
        match = re.fullmatch(r'"((?:\\.|[^"\\])*)"(?:\s*(?:#.*)?)', value)
        if not match:
            return None
        try:
            return json.loads(f'"{match.group(1)}"')
        except json.JSONDecodeError:
            return None
    if value.startswith("'"):
        match = re.fullmatch(r"'([^']*)'(?:\s*(?:#.*)?)", value)
        return match.group(1) if match else None
    return re.split(r"\s+#", value, maxsplit=1)[0].rstrip()


def load_allowed_dotenv(path: Path | None = None) -> dict[str, str]:
    """Load only approved credentials from the exact project .env path.

    Existing process environment variables are deliberately handled by
    ``allowed_secret`` and always take precedence. Malformed lines and
    symlinked/writable files are ignored without exposing their contents.
    """
    target = (path or PROJECT_ENV_PATH)
    try:
        target = target.absolute()
        resolved = target.resolve(strict=True)
        if resolved != target or not resolved.is_file():
            return {}
        stat = resolved.stat()
        if stat.st_size > DOTENV_MAX_BYTES or (os.name != "nt" and stat.st_mode & 0o002):
            return {}
        text = resolved.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return {}
    values: dict[str, str] = {}
    assignment = re.compile(r"^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$")
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = assignment.fullmatch(stripped)
        if not match or match.group(1) not in ALLOWED_SECRET_NAMES:
            continue
        value = _parse_dotenv_value(match.group(2))
        if value is not None and "\x00" not in value:
            values[match.group(1)] = value.strip()
    return values


def allowed_secret(name: str, dotenv: dict[str, str] | None = None) -> str:
    if name not in ALLOWED_SECRET_NAMES:
        return ""
    if name in os.environ:
        return os.environ[name].strip()
    return str((dotenv if dotenv is not None else load_allowed_dotenv()).get(name, "")).strip()


def publisher_label(url: str) -> str:
    """Return the direct publisher host, never a portal/search label."""
    host = (urllib.parse.urlsplit(url).hostname or "").lower().removeprefix("www.")
    return host or "unknown-publisher"


def load_editorial_feedback(path: Path | None) -> tuple[set[str], set[str]]:
    """Load exact editor rejections without treating the file as executable config."""
    if path is None or not path.exists():
        return set(), set()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        return set(), set()
    urls: set[str] = set()
    titles: set[str] = set()
    for item in (payload.get("exclusions") if isinstance(payload, dict) else []) or []:
        if not isinstance(item, dict):
            continue
        for value in [item.get("url"), *((item.get("relatedUrls") or []) if isinstance(item.get("relatedUrls"), list) else [])]:
            if isinstance(value, str) and value.strip():
                try:
                    urls.add(canonical_url(value))
                except ValueError:
                    pass
        fingerprint = normalize_title(str(item.get("titleFingerprint") or item.get("title") or ""))
        if fingerprint:
            titles.add(fingerprint)
    return urls, titles


def rejected_by_editor(article: Article, feedback: tuple[set[str], set[str]]) -> bool:
    urls, titles = feedback
    return canonical_url(article.url) in urls or normalize_title(article.title) in titles


def parse_date(value: str | None) -> str:
    if not value:
        return ""
    try:
        dt = parsedate_to_datetime(value)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone().isoformat(timespec="seconds")
    except (TypeError, ValueError, OverflowError):
        return clean_text(value)


def fetch_bytes(url: str, headers: dict[str, str] | None = None) -> bytes:
    request_headers = {"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml, application/json"}
    request_headers.update(headers or {})
    request = urllib.request.Request(url, headers=request_headers)
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read()


def safe_error(exc: Exception) -> str:
    """Return a bounded diagnostic with credential values removed."""
    message = f"{type(exc).__name__}: {exc}"
    dotenv = load_allowed_dotenv()
    for name in (
        "NAVER_API_HUB_CLIENT_ID", "NAVER_API_HUB_CLIENT_SECRET",
        "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET",
        "KAKAO_REST_API_KEY", "KAKAO_API_KEY",
    ):
        value = allowed_secret(name, dotenv)
        if value:
            message = message.replace(value, "[redacted]")
    return message[:240]


def collect_rss(source: dict) -> list[Article]:
    payload = fetch_bytes(source["url"])
    root = ET.fromstring(payload.lstrip(b"\xef\xbb\xbf"))
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    articles: list[Article] = []
    # RSS 2.0 uses item; a few broadcaster feeds publish Atom entry elements.
    items = root.findall(".//item") or root.findall(".//{*}entry")
    for item in items:
        title = clean_text(item.findtext("title") or item.findtext("{*}title"))
        url = clean_text(item.findtext("link") or item.findtext("{*}link"))
        if not url:
            link = item.find("{*}link")
            url = clean_text(link.get("href") if link is not None else "")
        if not title or not url:
            continue
        published = (
            item.findtext("pubDate")
            or item.findtext("date")
            or item.findtext("{*}date")
            or item.findtext("{*}published")
            or item.findtext("{*}updated")
        )
        # Feed descriptions/summaries are publisher-provided discovery metadata,
        # not article bodies.  Sanitize before the bounded export below.
        excerpt = clean_text(item.findtext("description") or item.findtext("{*}summary"))[:MAX_INGESTED_FEED_EXCERPT_CHARS]
        articles.append(
            Article(
                source=source["name"],
                title=title,
                url=canonical_url(url),
                published_at=parse_date(published),
                collected_at=now,
                signal_text=excerpt,
                provenance="rss-description-or-atom-summary",
            )
        )
    return articles


def collect_naver(queries: Iterable[str]) -> list[Article]:
    dotenv = load_allowed_dotenv()
    hub_id = allowed_secret("NAVER_API_HUB_CLIENT_ID", dotenv)
    hub_secret = allowed_secret("NAVER_API_HUB_CLIENT_SECRET", dotenv)
    legacy_id = allowed_secret("NAVER_CLIENT_ID", dotenv)
    legacy_secret = allowed_secret("NAVER_CLIENT_SECRET", dotenv)
    if hub_id and hub_secret:
        endpoint = "https://naverapihub.apigw.ntruss.com/search/v1/news"
        headers = {
            "X-NCP-APIGW-API-KEY-ID": hub_id,
            "X-NCP-APIGW-API-KEY": hub_secret,
        }
    elif legacy_id and legacy_secret:
        endpoint = "https://openapi.naver.com/v1/search/news.json"
        headers = {
            "X-Naver-Client-Id": legacy_id,
            "X-Naver-Client-Secret": legacy_secret,
        }
    else:
        return []
    now = datetime.now().astimezone().isoformat(timespec="seconds")
    articles: list[Article] = []
    for query in queries:
        try:
            params = urllib.parse.urlencode({"query": query, "display": 100, "sort": "date"})
            payload = json.loads(fetch_bytes(f"{endpoint}?{params}", headers).decode("utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, ValueError):
            # A failed query must not discard successful queries or RSS results.
            continue
        if not isinstance(payload, dict):
            continue
        for item in payload.get("items", []):
            if not isinstance(item, dict):
                continue
            title = clean_text(item.get("title"))
            origin_candidate = clean_text(item.get("originallink"))
            portal_candidate = clean_text(item.get("link"))
            origin_parts = urllib.parse.urlsplit(origin_candidate)
            portal_parts = urllib.parse.urlsplit(portal_candidate)
            origin_url = origin_candidate if origin_parts.scheme in {"http", "https"} and origin_parts.netloc else ""
            portal_url = portal_candidate if portal_parts.scheme in {"http", "https"} and portal_parts.netloc else ""
            url = origin_url or portal_url
            if not title or not url:
                continue
            direct = bool(origin_url)
            articles.append(
                Article(
                    source=publisher_label(url) if direct else "portal:naver",
                    title=title,
                    url=canonical_url(url),
                    published_at=parse_date(item.get("pubDate")),
                    collected_at=now,
                    signal_text=clean_text(item.get("description")),
                    provenance="publisher-original-link:naver-search" if direct else "aggregator-naver-search-unresolved",
                )
            )
    return articles


def historical_article(record: HistoricalRecord, collected_at: str) -> Article:
    return Article(
        source=record.source,
        title=clean_text(record.title)[:500],
        url=canonical_url(record.url),
        published_at=record.published_at,
        collected_at=collected_at,
        signal_text=clean_text(record.description)[:MAX_INGESTED_FEED_EXCERPT_CHARS],
        provenance=record.provenance,
    )


def score_article(article: Article, scoring: dict[str, list[str]]) -> Article:
    # 후보 점수는 제목만 사용한다. RSS 요약문은 관련 없는 고빈도 단어가 많아
    # 생활밀착도와 감정 점수를 과도하게 높이는 경향이 있다.
    haystack = article.title.casefold()
    matched: list[str] = []

    def count(group: str) -> int:
        terms = [term for term in scoring[group] if term.casefold() in haystack]
        matched.extend(f"{group}:{term}" for term in terms)
        return len(terms)

    article.fear = count("fear")
    article.frustration = count("frustration")
    article.absurd = count("absurd")
    article.everyday = count("everyday")
    article.visual = count("visual")
    article.excluded = count("exclude")
    article.score = (
        article.fear * 2
        + article.frustration * 2
        + article.absurd * 2
        + article.everyday * 2
        + article.visual
        - article.excluded * 4
    )
    article.matched_keywords = ", ".join(matched)
    return article


def clamp_lookback_days(value: object, default: int = DEFAULT_LOOKBACK_DAYS) -> int:
    """Keep rolling scans bounded to a 1..30 day archive window."""
    try:
        days = int(value)
    except (TypeError, ValueError):
        days = int(default)
    return max(1, min(MAX_LOOKBACK_DAYS, days))


def article_timestamp(article: Article) -> datetime | None:
    """Use publisher time when valid; otherwise collection time as the expiry clock."""
    for value in (article.published_at, article.collected_at):
        if not value:
            continue
        try:
            timestamp = datetime.fromisoformat(value)
            if timestamp.tzinfo is None:
                timestamp = timestamp.replace(tzinfo=timezone.utc)
            return timestamp
        except ValueError:
            continue
    return None


def recent_enough(article: Article, days: int) -> bool:
    timestamp = article_timestamp(article)
    if timestamp is None:
        return False
    return timestamp >= datetime.now(timestamp.tzinfo) - timedelta(days=clamp_lookback_days(days))


def rolling_recent_enough(article: Article, days: int) -> bool:
    """Bound history by publication time, falling back to collection time."""
    timestamp = article_timestamp(article)
    return timestamp is not None and timestamp >= datetime.now(timestamp.tzinfo) - timedelta(days=clamp_lookback_days(days))


def deduplicate(articles: Iterable[Article]) -> list[Article]:
    best: dict[str, Article] = {}
    for article in articles:
        key = normalize_title(article.title)
        if not key:
            continue
        current = best.get(key)
        if current is None or article.score > current.score:
            best[key] = article
    return list(best.values())


def is_candidate(article: Article, minimum_score: int) -> bool:
    # Editorial target: an ordinary setting that escalates into tangible risk,
    # irrational/explanation-gap details, or accountability evasion. Generic
    # crime headlines without a harm/absurdity signal stay out.
    close_to_home = article.everyday > 0
    harm_or_risk = article.fear > 0
    escalation_or_gap = article.absurd > 0
    accountability_evasion = article.frustration > 0
    contextual = close_to_home and harm_or_risk and (escalation_or_gap or accountability_evasion)
    visibly_newsworthy = article.visual > 0 and harm_or_risk and (escalation_or_gap or accountability_evasion)
    return article.score >= minimum_score and (contextual or visibly_newsworthy)


def init_db(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS articles (
            article_id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            published_at TEXT,
            collected_at TEXT NOT NULL,
            score INTEGER NOT NULL,
            fear INTEGER NOT NULL,
            frustration INTEGER NOT NULL,
            absurd INTEGER NOT NULL,
            everyday INTEGER NOT NULL,
            visual INTEGER NOT NULL,
            excluded INTEGER NOT NULL,
            matched_keywords TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'new',
            notes TEXT NOT NULL DEFAULT ''
        )
        """
    )
    columns = {row[1] for row in connection.execute("PRAGMA table_info(articles)")}
    if "signal_text" not in columns:
        connection.execute("ALTER TABLE articles ADD COLUMN signal_text TEXT NOT NULL DEFAULT ''")
    if "provenance" not in columns:
        connection.execute("ALTER TABLE articles ADD COLUMN provenance TEXT NOT NULL DEFAULT 'rss-description-or-atom-summary'")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_articles_score ON articles(score DESC)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC)")
    connection.execute("CREATE INDEX IF NOT EXISTS idx_articles_url ON articles(url)")


def save_articles(connection: sqlite3.Connection, articles: Iterable[Article]) -> int:
    before = connection.total_changes
    for article in articles:
        existing = connection.execute(
            "SELECT article_id FROM articles WHERE url = ? ORDER BY collected_at DESC LIMIT 1",
            (canonical_url(article.url),),
        ).fetchone()
        article_id = existing[0] if existing else article.article_id
        connection.execute(
            """
            INSERT INTO articles (
                article_id, source, title, url, published_at, collected_at, score,
                fear, frustration, absurd, everyday, visual, excluded, matched_keywords,
                signal_text, provenance
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(article_id) DO UPDATE SET
                source=CASE
                    WHEN articles.provenance LIKE 'publisher-%' AND excluded.provenance NOT LIKE 'publisher-%' THEN articles.source
                    ELSE excluded.source
                END,
                title=CASE
                    WHEN articles.provenance LIKE 'publisher-%' AND excluded.provenance NOT LIKE 'publisher-%' THEN articles.title
                    ELSE excluded.title
                END,
                url=excluded.url,
                published_at=CASE WHEN excluded.published_at <> '' THEN excluded.published_at ELSE articles.published_at END,
                collected_at=CASE
                    WHEN excluded.published_at <> '' OR articles.published_at <> ''
                    THEN excluded.collected_at
                    ELSE articles.collected_at
                END,
                score=excluded.score,
                fear=excluded.fear,
                frustration=excluded.frustration,
                absurd=excluded.absurd,
                everyday=excluded.everyday,
                visual=excluded.visual,
                excluded=excluded.excluded,
                matched_keywords=excluded.matched_keywords,
                signal_text=CASE
                    WHEN articles.provenance LIKE 'publisher-%' AND excluded.provenance NOT LIKE 'publisher-%' THEN articles.signal_text
                    WHEN excluded.signal_text <> '' THEN excluded.signal_text
                    ELSE articles.signal_text
                END,
                provenance=CASE
                    WHEN excluded.provenance LIKE 'publisher-%' THEN excluded.provenance
                    ELSE articles.provenance
                END
            """,
            (
                article_id, article.source, article.title, article.url,
                article.published_at, article.collected_at, article.score,
                article.fear, article.frustration, article.absurd, article.everyday,
                article.visual, article.excluded, article.matched_keywords,
                article.signal_text, article.provenance,
            ),
        )
    connection.commit()
    return connection.total_changes - before


def load_recent_articles(connection: sqlite3.Connection, days: int) -> list[Article]:
    """Load the deduplicated rolling SQLite history inside the lookback."""
    rows = connection.execute(
        """
        SELECT source, title, url, published_at, collected_at, score, fear,
               frustration, absurd, everyday, visual, excluded,
               matched_keywords, signal_text, provenance
        FROM articles
        """
    ).fetchall()
    articles = [
        Article(
            source=row[0], title=row[1], url=row[2], published_at=row[3] or "",
            collected_at=row[4], score=row[5], fear=row[6], frustration=row[7],
            absurd=row[8], everyday=row[9], visual=row[10], excluded=row[11],
            matched_keywords=row[12], signal_text=row[13] or "", provenance=row[14] or "rss-description-or-atom-summary",
        )
        for row in rows
    ]
    recent = deduplicate(article for article in articles if rolling_recent_enough(article, days))
    recent.sort(key=lambda item: (item.published_at or item.collected_at, item.collected_at), reverse=True)
    return recent


def export_csv(path: Path, articles: Iterable[Article]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "score", "fear", "frustration", "absurd", "everyday", "visual",
        "published_at", "source", "title", "url", "matched_keywords",
    ]
    with path.open("w", newline="", encoding="utf-8-sig") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for article in articles:
            writer.writerow({field: getattr(article, field) for field in fields})


def balanced_article_pool(articles: Iterable[Article], limit: int, daily_limit: int, max_days: int = DEFAULT_LOOKBACK_DAYS) -> tuple[list[Article], dict[str, int]]:
    """Keep at most ``daily_limit`` newest rows per Korean calendar day.

    The global limit remains authoritative. Publisher timestamps are converted
    to Asia/Seoul before bucketing; undated rows use their immutable collection
    timestamp through ``article_timestamp``.
    """
    bounded_limit = max(1, min(DEFAULT_ARTICLE_POOL_LIMIT, int(limit)))
    bounded_daily_limit = max(1, min(DEFAULT_DAILY_ARTICLE_LIMIT, int(daily_limit)))
    bounded_days = clamp_lookback_days(max_days)
    ordered = sorted(
        articles,
        key=lambda item: (article_timestamp(item) or datetime.min.replace(tzinfo=timezone.utc), item.collected_at, item.url),
        reverse=True,
    )
    day_counts: dict[str, int] = {}
    selected: list[Article] = []
    for article in ordered:
        timestamp = article_timestamp(article)
        if timestamp is None:
            continue
        day = timestamp.astimezone(POOL_TIMEZONE).date().isoformat()
        if day not in day_counts and len(day_counts) >= bounded_days:
            continue
        if day_counts.get(day, 0) >= bounded_daily_limit:
            continue
        day_counts[day] = day_counts.get(day, 0) + 1
        selected.append(article)
        if len(selected) >= bounded_limit:
            break
    return selected, day_counts


def export_article_pool(path: Path, articles: Iterable[Article], limit: int, excerpt_limit: int = 600, stale_after_hours: int = 6, rolling_window_days: int = DEFAULT_LOOKBACK_DAYS, archive_stats: dict | None = None, daily_limit: int = DEFAULT_DAILY_ARTICLE_LIMIT) -> int:
    """Write a bounded feed-metadata pool for explicit semantic review.

    Only sanitized RSS/Atom description or summary excerpts are included. Full
    article bodies and media remain out of scope. Each Korean calendar day is
    capped before the global bound so one busy news day cannot crowd the rest
    of the rolling window out of semantic review.
    """
    excerpt_limit = max(0, min(1_200, int(excerpt_limit)))
    bounded, daily_counts = balanced_article_pool(articles, limit, daily_limit, rolling_window_days)
    payload = {
        "version": 3,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "content_scope": "publisher-feed-and-sitemap-metadata-with-bounded-excerpt",
        "metadata_only": True,
        "full_bodies_included": False,
        "excerpt_max_chars": excerpt_limit,
        "stale_after_hours": max(1, min(168, int(stale_after_hours))),
        "rolling_window_days": clamp_lookback_days(rolling_window_days),
        "bounded_limit": max(1, min(DEFAULT_ARTICLE_POOL_LIMIT, int(limit))),
        "daily_article_limit": max(1, min(DEFAULT_DAILY_ARTICLE_LIMIT, int(daily_limit))),
        "covered_day_count": len(daily_counts),
        "daily_counts": daily_counts,
        "archive": archive_stats or {},
        "articles": [
            {
                "article_id": article.article_id,
                "source": article.source,
                "title": article.title,
                "url": article.url,
                "published_at": article.published_at,
                "collected_at": article.collected_at,
                "deterministic_score": article.score,
                "feed_excerpt": clean_text(article.signal_text)[:excerpt_limit],
                "excerpt_provenance": article.provenance if article.signal_text else "unavailable",
            }
            for article in bounded
        ],
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    temporary.replace(path)
    return len(bounded)


def load_config(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as stream:
        return json.load(stream)


def archive_statistics(connection: sqlite3.Connection, days: int) -> dict:
    rows = connection.execute(
        "SELECT source, url, published_at, collected_at, provenance FROM articles"
    ).fetchall()
    by_url: dict[str, tuple] = {}
    for row in rows:
        probe = Article(row[0], "archive", row[1], row[2] or "", row[3], provenance=row[4] or "")
        if not rolling_recent_enough(probe, days):
            continue
        current = by_url.get(canonical_url(row[1]))
        if current is None or (row[2] or row[3]) > (current[2] or current[3]):
            by_url[canonical_url(row[1])] = row
    dated = []
    historical = []
    sources: dict[str, dict] = {}
    for source, _, published_at, collected_at, provenance in by_url.values():
        timestamp = article_timestamp(Article(source, "archive", "https://archive.invalid", published_at or "", collected_at))
        if timestamp is None:
            continue
        dated.append(timestamp)
        if str(provenance or "").startswith("publisher-"):
            historical.append(timestamp)
            item = sources.setdefault(source, {"count": 0, "oldestPublishedAt": None, "newestPublishedAt": None})
            item["count"] += 1
            value = timestamp.isoformat(timespec="seconds")
            item["oldestPublishedAt"] = min(item["oldestPublishedAt"] or value, value)
            item["newestPublishedAt"] = max(item["newestPublishedAt"] or value, value)
    oldest = min(dated) if dated else None
    newest = max(dated) if dated else None
    historical_oldest = min(historical) if historical else None
    historical_newest = max(historical) if historical else None
    span_days = (historical_newest.date() - historical_oldest.date()).days + 1 if historical_oldest and historical_newest else 0
    return {
        "requestedDays": clamp_lookback_days(days),
        "totalArchiveCount": len(by_url),
        "historicalArchiveCount": len(historical),
        "sourceCount": len(sources),
        "oldestPublishedAt": oldest.isoformat(timespec="seconds") if oldest else None,
        "newestPublishedAt": newest.isoformat(timespec="seconds") if newest else None,
        "historicalOldestPublishedAt": historical_oldest.isoformat(timespec="seconds") if historical_oldest else None,
        "historicalNewestPublishedAt": historical_newest.isoformat(timespec="seconds") if historical_newest else None,
        "actualCoveredDayRange": span_days,
        "sources": sources,
    }


def write_atomic_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(f"{json.dumps(payload, ensure_ascii=False, indent=2)}\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="생활 밀착형 황당·공포·답답 뉴스 후보 수집기")
    parser.add_argument("--config", type=Path, default=BASE_DIR / "config.json")
    parser.add_argument("--top", type=int, default=30, help="CSV와 화면에 출력할 후보 수")
    parser.add_argument("--feedback", type=Path, default=None, help="편집자 제외 피드백 JSON")
    args = parser.parse_args()

    config = load_config(args.config.resolve())
    feedback = load_editorial_feedback(args.feedback.resolve() if args.feedback else None)
    collected: list[Article] = []
    errors: list[str] = []

    for source in config["rss_sources"]:
        if not source.get("enabled", True):
            continue
        try:
            items = collect_rss(source)
            collected.extend(items)
            print(f"[OK] {source['name']}: {len(items)}건")
        except Exception as exc:
            errors.append(f"{source['name']}: {safe_error(exc)}")
            print(f"[WARN] {source['name']}: 수집 실패", file=sys.stderr)

    naver_config = config.get("naver_search", {})
    if naver_config.get("enabled", False):
        try:
            naver_items = collect_naver(config.get("naver_queries", []))
            collected.extend(naver_items)
            if naver_items:
                print(f"[OK] 네이버 뉴스 검색(보조): {len(naver_items)}건")
            else:
                print("[SKIP] NAVER API HUB 키 없음 (발행사 피드만 수집)")
        except Exception as exc:
            errors.append(f"네이버 뉴스 검색: {safe_error(exc)}")
            print("[WARN] 네이버 뉴스 검색 수집 실패", file=sys.stderr)
    else:
        print("[SKIP] 네이버 검색 비활성 (발행사 피드가 기본 수집원)")

    scored = [score_article(article, config["scoring"]) for article in collected]
    lookback_days = clamp_lookback_days(config.get("lookback_days", DEFAULT_LOOKBACK_DAYS))
    scored = [article for article in scored if recent_enough(article, lookback_days)]
    scored = deduplicate(scored)
    scored.sort(key=lambda item: (item.score, item.published_at), reverse=True)

    db_path = BASE_DIR / config["database"]
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        init_db(connection)
        changed = save_articles(connection, scored)
        rolling = load_recent_articles(connection, lookback_days)

    filtered_scored = [item for item in scored if not rejected_by_editor(item, feedback)]
    filtered_rolling = [item for item in rolling if not rejected_by_editor(item, feedback)]
    feedback_excluded = (len(scored) - len(filtered_scored)) + (len(rolling) - len(filtered_rolling))
    candidates = [item for item in filtered_scored if is_candidate(item, int(config["minimum_score"]))][: args.top]
    csv_path = BASE_DIR / config["csv_output"]
    export_csv(csv_path, candidates)
    pool_path = BASE_DIR / config.get("article_pool_output", "data/latest_article_pool.json")
    pool_count = export_article_pool(
        pool_path,
        filtered_rolling,
        int(config.get("article_pool_limit", DEFAULT_ARTICLE_POOL_LIMIT)),
        int(config.get("excerpt_max_chars", 600)),
        int(config.get("stale_after_hours", 6)),
        lookback_days,
        daily_limit=int(config.get("daily_article_limit", DEFAULT_DAILY_ARTICLE_LIMIT)),
    )

    print(f"\n수집 {len(collected)}건 / 현재 스냅샷 {len(scored)}건 / rolling eligible {len(rolling)}건 / 전체 풀 {pool_count}건 / 후보 {len(candidates)}건")
    print(f"DB 변경 {changed}건: {db_path}")
    print(f"전체 메타데이터 풀: {pool_path}")
    print(f"CSV: {csv_path}")
    print("NEWS_RADAR_STATS " + json.dumps({
        "collected": len(collected),
        "deduplicated": len(scored),
        "pool": pool_count,
        "candidates": len(candidates),
        "current_collected": len(collected),
        "current_snapshot": len(scored),
        "rolling_eligible": len(rolling),
        "rolling_pool": pool_count,
        "rolling_window_days": lookback_days,
        "feedback_excluded": feedback_excluded,
    }, ensure_ascii=True, separators=(",", ":")))
    for index, article in enumerate(candidates[:10], start=1):
        print(f"{index:>2}. [{article.score:>2}] {article.title} ({article.source})")

    if errors:
        print("\n일부 수집원 오류:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
    return 0 if collected else 1


def main_v2() -> int:
    parser = argparse.ArgumentParser(description="Publisher metadata collector with an explicit bounded historical backfill")
    parser.add_argument("--config", type=Path, default=BASE_DIR / "config.json")
    parser.add_argument("--top", type=int, default=30, help="Maximum deterministic candidates written to CSV")
    parser.add_argument("--mode", choices=("current", "backfill", "incremental"), default="incremental")
    parser.add_argument("--days", type=int, default=None, help="Historical window, clamped to 1..30 days")
    parser.add_argument("--feedback", type=Path, default=None, help="Editorial rejection feedback JSON")
    args = parser.parse_args()

    config = load_config(args.config.resolve())
    feedback = load_editorial_feedback(args.feedback.resolve() if args.feedback else None)
    collection_started = datetime.now().astimezone()
    status_path = BASE_DIR / config.get("collection_status_output", "data/latest_collection_status.json")
    db_path = BASE_DIR / config["database"]
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as connection:
        init_db(connection)
        known_urls = {canonical_url(row[0]) for row in connection.execute("SELECT url FROM articles") if row[0]}
        latest_row = connection.execute("SELECT MAX(collected_at) FROM articles").fetchone()
    latest_collected_at = parse_timestamp(latest_row[0]) if latest_row and latest_row[0] else None
    try:
        previous_status = json.loads(status_path.read_text(encoding="utf-8"))
        if previous_status.get("state") == "completed":
            latest_collected_at = parse_timestamp(previous_status.get("completedAt")) or latest_collected_at
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        pass
    bootstrap = args.mode == "incremental" and not known_urls
    current_collected: list[Article] = []
    historical_collected: list[Article] = []
    historical_source_stats: list[dict] = []
    errors: list[str] = []
    lookback_days = clamp_lookback_days(args.days if args.days is not None else config.get("lookback_days", DEFAULT_LOOKBACK_DAYS))
    incremental_days = lookback_days if bootstrap or latest_collected_at is None else max(1, min(lookback_days, (collection_started.date() - latest_collected_at.astimezone().date()).days + 1))

    for source in config["rss_sources"]:
        if not source.get("enabled", True):
            continue
        try:
            items = collect_rss(source)
            current_collected.extend(items)
            print(f"[OK] current RSS {source['name']}: {len(items)}")
        except Exception as exc:
            errors.append(f"{source['name']}: {safe_error(exc)}")
            print(f"[WARN] current RSS {source['name']}: failed", file=sys.stderr)

    naver_config = config.get("naver_search", {})
    if naver_config.get("enabled", False):
        try:
            naver_items = collect_naver(config.get("naver_queries", []))
            current_collected.extend(naver_items)
            dotenv = load_allowed_dotenv()
            has_hub_credentials = bool(allowed_secret("NAVER_API_HUB_CLIENT_ID", dotenv) and allowed_secret("NAVER_API_HUB_CLIENT_SECRET", dotenv))
            has_legacy_credentials = bool(allowed_secret("NAVER_CLIENT_ID", dotenv) and allowed_secret("NAVER_CLIENT_SECRET", dotenv))
            if naver_items or has_hub_credentials or has_legacy_credentials:
                print(f"[OK] optional Naver supplement: {len(naver_items)}")
            else:
                print("[SKIP] optional Naver supplement: credentials not configured")
        except Exception as exc:
            errors.append(f"Naver supplement: {safe_error(exc)}")
            print("[WARN] optional Naver supplement failed", file=sys.stderr)
    else:
        print("[SKIP] optional Naver supplement disabled")

    current_discovered = len(current_collected)
    if args.mode == "incremental":
        current_collected = [article for article in current_collected if canonical_url(article.url) not in known_urls]

    if args.mode in {"backfill", "incremental"}:
        collected_at = datetime.now().astimezone().isoformat(timespec="seconds")
        for source in config.get("historical_sources", []):
            if not source.get("enabled", True):
                continue
            try:
                records, source_stats = crawl_historical_source(
                    source,
                    clamp_backfill_days(incremental_days if args.mode == "incremental" else lookback_days),
                    known_urls=known_urls if args.mode == "incremental" else (),
                )
                historical_source_stats.append(source_stats)
                historical_collected.extend(historical_article(record, collected_at) for record in records)
                print(
                    f"[OK] historical {source['name']}: discovered={source_stats['discovered']} "
                    f"fetched={source_stats['fetched']} accepted={source_stats['accepted']} "
                    f"oldest={source_stats['oldestPublishedAt']} newest={source_stats['newestPublishedAt']}"
                )
            except Exception as exc:
                message = safe_error(exc)
                historical_source_stats.append({
                    "source": str(source.get("name") or "unknown"), "discovered": 0, "fetched": 0,
                    "accepted": 0, "oldestPublishedAt": None, "newestPublishedAt": None,
                    "errorCount": 1, "errors": [message],
                })
                errors.append(f"historical {source.get('name', 'unknown')}: {message}")
                print(f"[WARN] historical {source.get('name', 'unknown')}: failed", file=sys.stderr)
    else:
        print("[SKIP] historical archive scan not requested")

    current_scored = [score_article(article, config["scoring"]) for article in current_collected]
    current_scored = deduplicate(article for article in current_scored if recent_enough(article, lookback_days))
    historical_scored = [score_article(article, config["scoring"]) for article in historical_collected]
    historical_scored = [article for article in historical_scored if recent_enough(article, lookback_days)]
    by_url: dict[str, Article] = {}
    for article in [*current_scored, *historical_scored]:
        by_url[canonical_url(article.url)] = article
    scored_for_save = list(by_url.values())
    scored = deduplicate(scored_for_save)
    scored.sort(key=lambda item: (item.score, item.published_at), reverse=True)

    with sqlite3.connect(db_path) as connection:
        init_db(connection)
        changed = save_articles(connection, scored_for_save)
        rolling = load_recent_articles(connection, lookback_days)
        archive = archive_statistics(connection, lookback_days)

    filtered_scored = [item for item in scored if not rejected_by_editor(item, feedback)]
    filtered_rolling = [item for item in rolling if not rejected_by_editor(item, feedback)]
    feedback_excluded = (len(scored) - len(filtered_scored)) + (len(rolling) - len(filtered_rolling))
    candidates = [item for item in filtered_scored if is_candidate(item, int(config["minimum_score"]))][: args.top]
    csv_path = BASE_DIR / config["csv_output"]
    export_csv(csv_path, candidates)
    pool_path = BASE_DIR / config.get("article_pool_output", "data/latest_article_pool.json")
    pool_count = export_article_pool(
        pool_path,
        filtered_rolling,
        int(config.get("article_pool_limit", DEFAULT_ARTICLE_POOL_LIMIT)),
        int(config.get("excerpt_max_chars", 600)),
        int(config.get("stale_after_hours", 6)),
        lookback_days,
        archive,
        daily_limit=int(config.get("daily_article_limit", DEFAULT_DAILY_ARTICLE_LIMIT)),
    )
    delta_path = BASE_DIR / config.get("collection_delta_output", "data/latest_collection_delta.json")
    pool_payload = json.loads(pool_path.read_text(encoding="utf-8"))
    pool_article_ids = {str(item.get("article_id") or "") for item in pool_payload.get("articles", [])}
    delta_article_ids = list(dict.fromkeys(article.article_id for article in scored_for_save if article.article_id in pool_article_ids))[:DEFAULT_ARTICLE_POOL_LIMIT]
    write_atomic_json(delta_path, {
        "version": 1,
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "mode": args.mode,
        "bootstrap": bootstrap,
        "incrementalSince": latest_collected_at.isoformat(timespec="seconds") if latest_collected_at else None,
        "poolGeneratedAt": pool_payload.get("generated_at"),
        "knownUrlCountBefore": len(known_urls),
        "newArticleCount": len(scored_for_save),
        "articleIds": delta_article_ids,
    })

    historical_discovered = sum(int(item.get("discovered") or 0) for item in historical_source_stats)
    historical_fetched = sum(int(item.get("fetched") or 0) for item in historical_source_stats)
    historical_saved = len({article.url for article in historical_scored})
    stats = {
        "mode": args.mode,
        "collected": len(current_collected) + len(historical_collected),
        "deduplicated": len(scored),
        "pool": pool_count,
        "candidates": len(candidates),
        "current_collected": len(current_collected),
        "current_discovered": current_discovered,
        "current_snapshot": len(current_scored),
        "incremental_since": latest_collected_at.isoformat(timespec="seconds") if latest_collected_at else None,
        "incremental_days": incremental_days if args.mode == "incremental" else None,
        "known_url_count_before": len(known_urls),
        "new_article_count": len(scored_for_save),
        "historical_discovered": historical_discovered,
        "historical_fetched": historical_fetched,
        "historical_saved": historical_saved,
        "historical_sources": historical_source_stats,
        "historical_error_count": sum(int(item.get("errorCount") or 0) for item in historical_source_stats),
        "rolling_eligible": len(rolling),
        "rolling_pool": pool_count,
        "rolling_window_days": lookback_days,
        "feedback_excluded": feedback_excluded,
        "archive": archive,
    }
    write_atomic_json(status_path, {
        "state": "completed",
        "completedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        **stats,
    })

    print(
        f"current={len(current_collected)} historical_saved={historical_saved} "
        f"archive={archive['totalArchiveCount']} semantic_pool={pool_count} candidates={len(candidates)}"
    )
    print(f"DB changes={changed}: {db_path}")
    print(f"bounded semantic pool: {pool_path}")
    print(f"atomic collection status: {status_path}")
    print(f"CSV: {csv_path}")
    print("NEWS_RADAR_STATS " + json.dumps(stats, ensure_ascii=True, separators=(",", ":")))
    for index, article in enumerate(candidates[:10], start=1):
        print(f"{index:>2}. [{article.score:>2}] {article.title} ({article.source})")

    if errors:
        print("Partial source errors:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
    return 0 if args.mode == "incremental" or current_collected or historical_collected else 1


if __name__ == "__main__":
    raise SystemExit(main_v2())
