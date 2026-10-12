from __future__ import annotations

import ipaddress
import json
import re
import socket
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from typing import Callable, Iterable


USER_AGENT = "NewsRadar/2.0 (personal topic research; metadata only)"
MAX_DAYS = 30
MAX_REDIRECTS = 3
MAX_SITEMAP_BYTES = 2_000_000
MAX_ARTICLE_BYTES = 750_000
MAX_SITEMAPS = 200
MAX_URLS = 4_000
MAX_URLS_PER_SITEMAP = 50
MAX_CONCURRENCY = 8
MAX_TIMEOUT_SECONDS = 20


@dataclass(frozen=True)
class SitemapEntry:
    url: str
    lastmod: str = ""
    title: str = ""
    published_at: str = ""
    description: str = ""


@dataclass(frozen=True)
class HistoricalRecord:
    source: str
    title: str
    url: str
    published_at: str
    description: str
    provenance: str


class HistoricalFetchError(RuntimeError):
    pass


def clamp_days(value: object, default: int = MAX_DAYS) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(MAX_DAYS, parsed))


def _bounded_int(value: object, default: int, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(minimum, min(maximum, parsed))


def _hostname(url: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(str(url).strip())
        port = parsed.port
    except ValueError as exc:
        raise HistoricalFetchError("invalid URL") from exc
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host or parsed.username or parsed.password or port not in (None, 443):
        raise HistoricalFetchError("only canonical HTTPS publisher URLs are allowed")
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return host
    raise HistoricalFetchError("IP-literal URLs are not allowed")


def validate_remote_url(url: str, allowed_hosts: Iterable[str], path_prefixes: Iterable[str] = ()) -> str:
    host = _hostname(url)
    allowed = {str(value).lower().rstrip(".") for value in allowed_hosts}
    if host not in allowed:
        raise HistoricalFetchError(f"publisher host is not allowlisted: {host}")
    parsed = urllib.parse.urlsplit(url)
    prefixes = tuple(str(value) for value in path_prefixes if str(value))
    if prefixes and not any(parsed.path.startswith(prefix) for prefix in prefixes):
        raise HistoricalFetchError("publisher URL path is outside the configured archive scope")
    return urllib.parse.urlunsplit(("https", parsed.netloc.lower(), parsed.path or "/", parsed.query, ""))


def validate_public_resolution(host: str) -> None:
    try:
        addresses = {row[4][0] for row in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)}
    except OSError as exc:
        raise HistoricalFetchError(f"publisher DNS lookup failed: {host}") from exc
    if not addresses:
        raise HistoricalFetchError(f"publisher DNS lookup returned no addresses: {host}")
    for value in addresses:
        address = ipaddress.ip_address(value)
        if any((address.is_private, address.is_loopback, address.is_link_local, address.is_multicast, address.is_reserved, address.is_unspecified)):
            raise HistoricalFetchError(f"publisher DNS resolved to a non-public address: {host}")


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def __init__(self, allowed_hosts: set[str], path_prefixes: tuple[str, ...], max_redirects: int):
        super().__init__()
        self.allowed_hosts = allowed_hosts
        self.path_prefixes = path_prefixes
        self.max_redirects = max_redirects

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001
        count = int(getattr(req, "news_radar_redirects", 0)) + 1
        if count > self.max_redirects:
            raise HistoricalFetchError("publisher redirect limit exceeded")
        safe = validate_remote_url(newurl, self.allowed_hosts, self.path_prefixes)
        validate_public_resolution(_hostname(safe))
        redirected = super().redirect_request(req, fp, code, msg, headers, safe)
        if redirected is not None:
            redirected.news_radar_redirects = count
        return redirected


def fetch_bounded(
    url: str,
    *,
    allowed_hosts: Iterable[str],
    path_prefixes: Iterable[str] = (),
    max_bytes: int,
    timeout_seconds: int,
    accept: str,
    allow_truncated: bool = False,
) -> tuple[bytes, str, str]:
    allowed = {str(value).lower().rstrip(".") for value in allowed_hosts}
    prefixes = tuple(str(value) for value in path_prefixes if str(value))
    safe_url = validate_remote_url(url, allowed, prefixes)
    validate_public_resolution(_hostname(safe_url))
    opener = urllib.request.build_opener(_SafeRedirectHandler(allowed, prefixes, MAX_REDIRECTS))
    request = urllib.request.Request(safe_url, headers={"User-Agent": USER_AGENT, "Accept": accept})
    try:
        with opener.open(request, timeout=timeout_seconds) as response:
            final_url = validate_remote_url(response.geturl(), allowed, prefixes)
            payload = response.read(max_bytes + 1)
            content_type = str(response.headers.get("Content-Type") or "")[:160]
    except (OSError, urllib.error.URLError, ValueError) as exc:
        raise HistoricalFetchError(str(exc)[:240]) from exc
    if len(payload) > max_bytes:
        if not allow_truncated:
            raise HistoricalFetchError(f"publisher response exceeded {max_bytes} bytes")
        payload = payload[:max_bytes]
    return payload, final_url, content_type


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _descendant_text(element: ET.Element, names: set[str]) -> str:
    for child in element.iter():
        if _local_name(child.tag) in names:
            value = " ".join("".join(child.itertext()).split())
            if value:
                return value
    return ""


def parse_sitemap(payload: bytes) -> tuple[str, list[SitemapEntry]]:
    prefix = payload[:2_048].upper()
    if b"<!DOCTYPE" in prefix or b"<!ENTITY" in prefix:
        raise HistoricalFetchError("DTD/entity declarations are not allowed in publisher sitemaps")
    try:
        root = ET.fromstring(payload.lstrip(b"\xef\xbb\xbf"))
    except ET.ParseError as exc:
        raise HistoricalFetchError("publisher sitemap XML is invalid") from exc
    kind = _local_name(root.tag)
    if kind not in {"sitemapindex", "urlset"}:
        raise HistoricalFetchError(f"unsupported publisher sitemap root: {kind}")
    expected = "sitemap" if kind == "sitemapindex" else "url"
    entries: list[SitemapEntry] = []
    for node in list(root):
        if _local_name(node.tag) != expected:
            continue
        location = _descendant_text(node, {"loc"})[:2_048]
        if not location:
            continue
        entries.append(SitemapEntry(
            url=location,
            lastmod=_descendant_text(node, {"lastmod"})[:80],
            title=_descendant_text(node, {"title"})[:500],
            published_at=_descendant_text(node, {"publication_date", "pubdate"})[:80],
            description=_descendant_text(node, {"description"})[:1_200],
        ))
    return kind, entries


def parse_timestamp(value: str) -> datetime | None:
    text = str(value or "").strip()
    if not text:
        return None
    normalized = text[:-1] + "+00:00" if text.endswith("Z") else text
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        try:
            parsed = datetime.strptime(text[:10], "%Y-%m-%d")
        except ValueError:
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def configured_child_date(url: str, source: dict) -> date | None:
    pattern = str(source.get("child_date_regex") or "")
    if not pattern:
        return None
    match = re.search(pattern, url)
    if not match:
        return None
    raw = match.groupdict().get("date") or (match.group(1) if match.groups() else "")
    try:
        return datetime.strptime(raw, str(source.get("child_date_format") or "%Y%m%d")).date()
    except ValueError:
        return None


def _entry_date(entry: SitemapEntry, source: dict) -> date | None:
    timestamp = parse_timestamp(entry.published_at) or parse_timestamp(entry.lastmod)
    return timestamp.date() if timestamp else configured_child_date(entry.url, source)


def _even_sample(entries: list[SitemapEntry], limit: int) -> list[SitemapEntry]:
    if len(entries) <= limit:
        return entries
    if limit <= 1:
        return entries[:1]
    indexes = {round(index * (len(entries) - 1) / (limit - 1)) for index in range(limit)}
    return [entries[index] for index in sorted(indexes)]


class _ArticleMetadataParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.canonical = ""
        self.title_parts: list[str] = []
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {str(key).lower(): str(value or "") for key, value in attrs}
        lowered = tag.lower()
        if lowered == "meta":
            key = (values.get("property") or values.get("name") or values.get("itemprop") or "").lower()
            if key and key not in self.meta:
                self.meta[key] = values.get("content", "")[:4_000]
        elif lowered == "link" and "canonical" in values.get("rel", "").lower():
            self.canonical = values.get("href", "")[:2_048]
        elif lowered == "title":
            self.in_title = True

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self.in_title = False

    def handle_data(self, data: str) -> None:
        if self.in_title and len("".join(self.title_parts)) < 1_000:
            self.title_parts.append(data)


def _clean(value: str, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


def parse_article_metadata(payload: bytes, page_url: str, content_type: str) -> tuple[str, str, str, str]:
    charset = "utf-8"
    match = re.search(r"charset\s*=\s*['\"]?([a-zA-Z0-9._-]+)", content_type, re.I)
    if match:
        charset = match.group(1)
    try:
        text = payload.decode(charset, "replace")
    except LookupError:
        text = payload.decode("utf-8", "replace")
    parser = _ArticleMetadataParser()
    parser.feed(text)
    title = _clean(parser.meta.get("og:title") or parser.meta.get("twitter:title") or "".join(parser.title_parts), 500)
    published = _clean(
        parser.meta.get("article:published_time")
        or parser.meta.get("published_date")
        or parser.meta.get("datepublished")
        or parser.meta.get("date"),
        80,
    )
    description = _clean(parser.meta.get("og:description") or parser.meta.get("description") or parser.meta.get("twitter:description"), 1_200)
    canonical = urllib.parse.urljoin(page_url, parser.canonical) if parser.canonical else page_url
    return title, published, description, canonical


class _ArchiveLinkParser(HTMLParser):
    def __init__(self, page_url: str, article_pattern: str):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.article_pattern = re.compile(article_pattern)
        self.links: list[tuple[str, str]] = []
        self.current_url = ""
        self.current_text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "a":
            return
        values = {str(key).lower(): str(value or "") for key, value in attrs}
        candidate = urllib.parse.urljoin(self.page_url, values.get("href", ""))
        if self.article_pattern.search(candidate):
            self.current_url = candidate
            self.current_text = []

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self.current_url:
            self.links.append((self.current_url, _clean(" ".join(self.current_text), 500)))
            self.current_url = ""
            self.current_text = []

    def handle_data(self, data: str) -> None:
        if self.current_url:
            self.current_text.append(data)


def parse_html_archive_links(payload: bytes, page_url: str, content_type: str, article_pattern: str, published_at: str) -> list[SitemapEntry]:
    text = _decode_html(payload, content_type)
    parser = _ArchiveLinkParser(page_url, article_pattern)
    parser.feed(text)
    unique: dict[str, SitemapEntry] = {}
    for url, title in parser.links:
        current = unique.get(url)
        if current is None or len(title) > len(current.title):
            unique[url] = SitemapEntry(url=url, lastmod=published_at, title=title)
    return list(unique.values())


class _BlockArchiveParser(HTMLParser):
    def __init__(self, page_url: str, article_pattern: str, block_class: str, title_class: str, description_class: str, date_class: str):
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.article_pattern = re.compile(article_pattern)
        self.block_class = block_class
        self.classes = {title_class: "title", description_class: "description", date_class: "date"}
        self.block_depth = 0
        self.field = ""
        self.stack: list[tuple[str, str]] = []
        self.current: dict[str, object] = {}
        self.entries: list[SitemapEntry] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {str(key).lower(): str(value or "") for key, value in attrs}
        classes = set(values.get("class", "").split())
        if tag.lower() == "div" and self.block_class in classes and self.block_depth == 0:
            self.block_depth = 1
            self.current = {"url": "", "title": [], "description": [], "date": []}
        elif self.block_depth and tag.lower() == "div":
            self.block_depth += 1
        if not self.block_depth:
            return
        self.stack.append((tag.lower(), self.field))
        for class_name, field in self.classes.items():
            if class_name and class_name in classes:
                self.field = field
                break
        if tag.lower() == "a":
            candidate = urllib.parse.urljoin(self.page_url, values.get("href", ""))
            if self.article_pattern.search(candidate):
                self.current["url"] = candidate

    def handle_endtag(self, tag: str) -> None:
        if not self.block_depth:
            return
        if self.stack:
            _, previous = self.stack.pop()
            self.field = previous
        if tag.lower() == "div":
            self.block_depth -= 1
            if self.block_depth == 0:
                url = str(self.current.get("url") or "")
                title = _clean(" ".join(self.current.get("title") or []), 500)
                description = _clean(" ".join(self.current.get("description") or []), 1_200)
                date_text = _clean(" ".join(self.current.get("date") or []), 200)
                match = re.search(r"(?P<date>[0-9]{4}-[0-9]{2}-[0-9]{2}(?:\s+[0-9]{2}:[0-9]{2})?)", date_text)
                if url and title and match:
                    self.entries.append(SitemapEntry(url=url, lastmod=match.group("date"), title=title, description=description))
                self.current = {}
                self.field = ""
                self.stack = []

    def handle_data(self, data: str) -> None:
        if self.block_depth and self.field in {"title", "description", "date"}:
            values = self.current.get(self.field)
            if isinstance(values, list):
                values.append(data)


def _decode_html(payload: bytes, content_type: str) -> str:
    charset = "utf-8"
    match = re.search(r"charset\s*=\s*['\"]?([a-zA-Z0-9._-]+)", content_type, re.I)
    if match:
        charset = match.group(1)
    try:
        return payload.decode(charset, "replace")
    except LookupError:
        return payload.decode("utf-8", "replace")


def parse_html_archive_blocks(payload: bytes, page_url: str, content_type: str, source: dict) -> list[SitemapEntry]:
    parser = _BlockArchiveParser(
        page_url,
        str(source.get("article_url_regex") or r"/article/"),
        str(source.get("archive_block_class") or "list-block"),
        str(source.get("archive_title_class") or "list-titles"),
        str(source.get("archive_description_class") or "list-summary"),
        str(source.get("archive_date_class") or "list-dated"),
    )
    parser.feed(_decode_html(payload, content_type))
    unique = {entry.url: entry for entry in parser.entries}
    return list(unique.values())


def crawl_historical_source(
    source: dict,
    days: int,
    *,
    now: datetime | None = None,
    known_urls: Iterable[str] = (),
    fetcher: Callable[..., tuple[bytes, str, str]] = fetch_bounded,
) -> tuple[list[HistoricalRecord], dict]:
    days = clamp_days(days)
    now = now or datetime.now().astimezone()
    today = now.date()
    start_date = today - timedelta(days=days - 1)
    allowed_hosts = tuple(source.get("allowed_hosts") or ())
    sitemap_prefixes = tuple(source.get("sitemap_path_prefixes") or ())
    article_prefixes = tuple(source.get("article_path_prefixes") or ())
    adapter = str(source.get("adapter") or "sitemap")
    archive_template = str(source.get("archive_url_template") or "")
    root_template = str(source.get("sitemap_url_template") or "")
    if adapter == "html-daily-archive":
        root_urls = []
        cursor = start_date
        while cursor <= today:
            root_urls.append(validate_remote_url(archive_template.format(date=cursor.strftime("%Y%m%d")), allowed_hosts, sitemap_prefixes))
            cursor += timedelta(days=1)
    elif adapter == "html-paged-archive":
        max_pages = _bounded_int(source.get("max_pages"), 120, 1, MAX_SITEMAPS)
        root_urls = [
            validate_remote_url(archive_template.format(page=page), allowed_hosts, sitemap_prefixes)
            for page in range(1, max_pages + 1)
        ]
    elif root_template:
        root_urls = [
            validate_remote_url(root_template.format(year=year), allowed_hosts, sitemap_prefixes)
            for year in range(start_date.year, today.year + 1)
        ]
    else:
        root_urls = [validate_remote_url(str(source.get("sitemap_url") or ""), allowed_hosts, sitemap_prefixes)]
    root_url = root_urls[-1]
    max_sitemaps = _bounded_int(source.get("max_sitemaps"), MAX_SITEMAPS, 1, MAX_SITEMAPS)
    max_urls = _bounded_int(source.get("max_urls"), MAX_URLS, 1, MAX_URLS)
    per_sitemap = _bounded_int(source.get("max_urls_per_sitemap"), MAX_URLS_PER_SITEMAP, 1, MAX_URLS_PER_SITEMAP)
    max_depth = _bounded_int(source.get("max_depth"), 2, 0, 2)
    timeout = _bounded_int(source.get("timeout_seconds"), MAX_TIMEOUT_SECONDS, 2, MAX_TIMEOUT_SECONDS)
    concurrency = _bounded_int(source.get("concurrency"), MAX_CONCURRENCY, 1, MAX_CONCURRENCY)
    known = {str(value).strip() for value in known_urls if str(value).strip()}
    known_skipped = 0

    queue: list[tuple[str, int]] = [(url, 0) for url in root_urls]
    seen_sitemaps: set[str] = set()
    discovered: list[SitemapEntry] = []
    errors: list[str] = []
    sitemap_bytes = 0
    while queue and len(seen_sitemaps) < max_sitemaps and len(discovered) < max_urls:
        sitemap_url, depth = queue.pop(0)
        if sitemap_url in seen_sitemaps:
            continue
        seen_sitemaps.add(sitemap_url)
        try:
            payload, final_url, content_type = fetcher(
                sitemap_url,
                allowed_hosts=allowed_hosts,
                path_prefixes=sitemap_prefixes,
                max_bytes=_bounded_int(source.get("max_sitemap_bytes"), MAX_SITEMAP_BYTES, 16_384, MAX_SITEMAP_BYTES),
                timeout_seconds=timeout,
                accept="text/html,application/xhtml+xml;q=0.9" if adapter.startswith("html-") else "application/xml,text/xml;q=0.9",
                allow_truncated=adapter.startswith("html-"),
            )
            sitemap_bytes += len(payload)
            if adapter == "html-daily-archive":
                archive_day = configured_child_date(final_url, source)
                if archive_day is None:
                    raise HistoricalFetchError("daily archive URL did not expose its configured date")
                entries = parse_html_archive_links(
                    payload, final_url, content_type,
                    str(source.get("article_url_regex") or r"/article/"), archive_day.isoformat(),
                )
                kind = "urlset"
            elif adapter == "html-paged-archive":
                entries = parse_html_archive_blocks(payload, final_url, content_type, source)
                kind = "urlset"
            else:
                kind, entries = parse_sitemap(payload)
            if kind == "sitemapindex":
                if depth >= max_depth:
                    errors.append(f"{final_url}: sitemap depth limit reached")
                    continue
                for entry in entries:
                    try:
                        child_url = validate_remote_url(entry.url, allowed_hosts, sitemap_prefixes)
                    except HistoricalFetchError as exc:
                        errors.append(f"{entry.url[:120]}: {exc}")
                        continue
                    child_day = _entry_date(entry, source)
                    if child_day is not None and not (start_date <= child_day <= today):
                        continue
                    if len(queue) + len(seen_sitemaps) >= max_sitemaps:
                        break
                    queue.append((child_url, depth + 1))
            else:
                eligible = []
                for entry in entries:
                    try:
                        article_url = validate_remote_url(entry.url, allowed_hosts, article_prefixes)
                    except HistoricalFetchError as exc:
                        errors.append(f"{entry.url[:120]}: {exc}")
                        continue
                    entry_day = _entry_date(entry, source)
                    if entry_day is None or not (start_date <= entry_day <= today):
                        continue
                    if article_url in known:
                        known_skipped += 1
                        continue
                    eligible.append(SitemapEntry(article_url, entry.lastmod, entry.title, entry.published_at, entry.description))
                discovered.extend(_even_sample(eligible, min(per_sitemap, max_urls - len(discovered))))
                if adapter == "html-paged-archive":
                    page_days = [value for value in (_entry_date(entry, source) for entry in entries) if value is not None]
                    if page_days and min(page_days) < start_date:
                        queue.clear()
        except Exception as exc:  # one failed publisher/day must not discard successful days
            errors.append(f"{sitemap_url}: {type(exc).__name__}: {str(exc)[:180]}")

    def fetch_article(entry: SitemapEntry) -> HistoricalRecord | None:
        title = _clean(entry.title, 500)
        published = entry.published_at or entry.lastmod
        description = _clean(entry.description, 1_200)
        canonical = entry.url
        if not title or not description or not (entry.published_at or entry.lastmod):
            payload, page_url, content_type = fetcher(
                entry.url,
                allowed_hosts=allowed_hosts,
                path_prefixes=article_prefixes,
                max_bytes=_bounded_int(source.get("max_article_bytes"), MAX_ARTICLE_BYTES, 32_768, MAX_ARTICLE_BYTES),
                timeout_seconds=timeout,
                accept="text/html,application/xhtml+xml;q=0.9",
                allow_truncated=True,
            )
            page_title, page_published, page_description, page_canonical = parse_article_metadata(payload, page_url, content_type)
            title = page_title or title
            published = page_published or published
            description = page_description or description
            canonical = validate_remote_url(page_canonical, allowed_hosts, article_prefixes)
        timestamp = parse_timestamp(published)
        if not title or timestamp is None or not (start_date <= timestamp.date() <= today):
            return None
        return HistoricalRecord(
            source=str(source.get("name") or _hostname(canonical))[:120],
            title=title,
            url=canonical,
            published_at=timestamp.isoformat(timespec="seconds"),
            description=description[:1_200],
            provenance=str(source.get("provenance") or "publisher-sitemap")[:80],
        )

    records: list[HistoricalRecord] = []
    fetched = 0
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {executor.submit(fetch_article, entry): entry for entry in discovered}
        for future in as_completed(futures):
            fetched += 1
            try:
                record = future.result()
                if record is not None:
                    records.append(record)
            except Exception as exc:
                entry = futures[future]
                errors.append(f"{entry.url}: {type(exc).__name__}: {str(exc)[:180]}")
    unique = {record.url: record for record in records}
    records = sorted(unique.values(), key=lambda item: item.published_at, reverse=True)
    dates = [parse_timestamp(record.published_at) for record in records]
    dates = [value for value in dates if value is not None]
    stats = {
        "source": str(source.get("name") or root_url),
        "sitemapUrl": root_url,
        "sitemapUrls": root_urls if len(root_urls) <= 3 else None,
        "archiveUrlTemplate": archive_template or None,
        "requestedDays": days,
        "sitemapsFetched": len(seen_sitemaps),
        "sitemapBytes": sitemap_bytes,
        "discovered": len(discovered),
        "fetched": fetched,
        "accepted": len(records),
        "knownSkipped": known_skipped,
        "oldestPublishedAt": min(dates).isoformat(timespec="seconds") if dates else None,
        "newestPublishedAt": max(dates).isoformat(timespec="seconds") if dates else None,
        "errors": errors[:200],
        "errorCount": len(errors),
    }
    return records, stats


def serialize_stats(stats: dict) -> str:
    return json.dumps(stats, ensure_ascii=True, separators=(",", ":"))
