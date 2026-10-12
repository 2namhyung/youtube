import sqlite3
import unittest
import urllib.request
from datetime import datetime, timezone
from unittest.mock import patch

from backfill import (
    HistoricalFetchError,
    _SafeRedirectHandler,
    clamp_days,
    crawl_historical_source,
    parse_article_metadata,
    parse_html_archive_links,
    parse_sitemap,
    validate_remote_url,
)
from collect import Article, init_db, load_recent_articles, save_articles


class HistoricalBackfillTests(unittest.TestCase):
    def test_days_are_clamped_to_one_through_thirty(self):
        self.assertEqual(clamp_days(0), 1)
        self.assertEqual(clamp_days(31), 30)
        self.assertEqual(clamp_days(999), 30)
        self.assertEqual(clamp_days("bad"), 30)

    def test_remote_url_requires_https_exact_allowlist_and_scoped_path(self):
        self.assertEqual(
            validate_remote_url("https://news.example/archive/day.xml#fragment", ["news.example"], ["/archive/"]),
            "https://news.example/archive/day.xml",
        )
        for value in (
            "http://news.example/archive/day.xml",
            "https://evil.example/archive/day.xml",
            "https://news.example.evil.test/archive/day.xml",
            "https://user:pass@news.example/archive/day.xml",
            "https://127.0.0.1/archive/day.xml",
            "https://news.example/private/day.xml",
        ):
            with self.subTest(value=value), self.assertRaises(HistoricalFetchError):
                validate_remote_url(value, ["news.example"], ["/archive/"])

    @patch("backfill.validate_public_resolution")
    def test_redirects_cannot_escape_allowlist_or_exceed_bound(self, public_resolution):
        handler = _SafeRedirectHandler({"news.example"}, ("/archive/",), 3)
        request = urllib.request.Request("https://news.example/archive/root.xml")
        with self.assertRaises(HistoricalFetchError):
            handler.redirect_request(request, None, 302, "Found", {}, "https://evil.example/archive/root.xml")
        request.news_radar_redirects = 3
        with self.assertRaises(HistoricalFetchError):
            handler.redirect_request(request, None, 302, "Found", {}, "https://news.example/archive/next.xml")
        public_resolution.assert_not_called()

    def test_sitemap_parser_reads_index_and_news_metadata_and_blocks_dtd(self):
        index = b'''<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://news.example/archive/20260727.xml</loc><lastmod>2026-07-27</lastmod></sitemap></sitemapindex>'''
        kind, entries = parse_sitemap(index)
        self.assertEqual(kind, "sitemapindex")
        self.assertEqual(entries[0].lastmod, "2026-07-27")
        urlset = b'''<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"><url><loc>https://news.example/article/1</loc><lastmod>2026-07-27T09:00:00+09:00</lastmod><news:news><news:publication_date>2026-07-27</news:publication_date><news:title>Safe title</news:title></news:news></url></urlset>'''
        kind, entries = parse_sitemap(urlset)
        self.assertEqual(kind, "urlset")
        self.assertEqual(entries[0].title, "Safe title")
        self.assertEqual(entries[0].published_at, "2026-07-27")
        with self.assertRaises(HistoricalFetchError):
            parse_sitemap(b'<!DOCTYPE x [<!ENTITY y SYSTEM "file:///etc/passwd">]><urlset/>')

    def test_article_parser_keeps_only_bounded_metadata(self):
        payload = b'''<html><head><title>Fallback</title><meta property="og:title" content="Article title"><meta property="og:description" content="Short excerpt"><meta property="article:published_time" content="2026-06-01T12:30:00+09:00"><link rel="canonical" href="/article/1"></head><body>body is ignored</body></html>'''
        title, published, description, canonical = parse_article_metadata(payload, "https://news.example/article/1", "text/html; charset=utf-8")
        self.assertEqual((title, published, description), ("Article title", "2026-06-01T12:30:00+09:00", "Short excerpt"))
        self.assertEqual(canonical, "https://news.example/article/1")

    def test_daily_html_archive_parser_discovers_all_article_links_without_keywords(self):
        payload = b'''<html><a href="/news/newsView.php?id=20260617601002">First title</a><a href="/news/newsView.php?id=20260617601003">Second title</a><a href="/search?q=incident">Not an article</a></html>'''
        entries = parse_html_archive_links(payload, "https://news.example/sitemap/sitemap_index_20260617", "text/html; charset=utf-8", r"/news/newsView\.php\?id=[0-9]+", "2026-06-17")
        self.assertEqual(len(entries), 2)
        self.assertEqual(entries[0].lastmod, "2026-06-17")
        self.assertEqual(entries[0].title, "First title")

    def test_crawl_filters_dates_deduplicates_and_survives_partial_failure(self):
        root = b'''<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
          <sitemap><loc>https://news.example/archive/20260727.xml</loc></sitemap>
          <sitemap><loc>https://news.example/archive/20260701.xml</loc></sitemap>
          <sitemap><loc>https://news.example/archive/20260626.xml</loc></sitemap>
        </sitemapindex>'''
        current = b'''<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://news.example/article/current</loc><lastmod>2026-07-27T09:00:00+09:00</lastmod></url></urlset>'''
        pages = {
            "https://news.example/archive/root.xml": (root, "application/xml"),
            "https://news.example/archive/20260727.xml": (current, "application/xml"),
            "https://news.example/article/current": (b'<meta property="og:title" content="Current"><meta property="published_date" content="2026-07-27"><meta property="og:description" content="Excerpt">', "text/html; charset=utf-8"),
        }

        def fake_fetch(url, **_kwargs):
            if url.endswith("20260701.xml"):
                raise HistoricalFetchError("one daily sitemap failed")
            payload, content_type = pages[url]
            return payload, url, content_type

        source = {
            "name": "Official publisher sitemap",
            "sitemap_url": "https://news.example/archive/root.xml",
            "allowed_hosts": ["news.example"],
            "sitemap_path_prefixes": ["/archive/"],
            "article_path_prefixes": ["/article/"],
            "child_date_regex": r"/archive/(?P<date>[0-9]{8})\.xml$",
            "child_date_format": "%Y%m%d",
            "max_sitemaps": 4,
            "max_urls": 10,
            "max_urls_per_sitemap": 10,
        }
        records, stats = crawl_historical_source(
            source,
            30,
            now=datetime(2026, 7, 27, 12, tzinfo=timezone.utc),
            fetcher=fake_fetch,
        )
        self.assertEqual([record.url for record in records], ["https://news.example/article/current"])
        self.assertEqual(stats["accepted"], 1)
        self.assertEqual(stats["errorCount"], 1)
        self.assertFalse(any("20260626" in error for error in stats["errors"]), "outside-window sitemap must not be fetched")

        repeated_records, repeated_stats = crawl_historical_source(
            source,
            30,
            now=datetime(2026, 7, 27, 12, tzinfo=timezone.utc),
            known_urls={"https://news.example/article/current"},
            fetcher=fake_fetch,
        )
        self.assertEqual(repeated_records, [], "incremental collection must not refetch a URL already in SQLite")
        self.assertEqual(repeated_stats["knownSkipped"], 1)

    def test_sqlite_upsert_deduplicates_same_url_across_acquisition_modes(self):
        rss = Article("RSS desk", "Original", "https://news.example/article/1", "2026-08-01", "2026-08-09", signal_text="RSS", provenance="rss-description-or-atom-summary")
        sitemap = Article("Archive desk", "Canonical title", "https://news.example/article/1", "2026-08-01", "2026-08-09", signal_text="Archive", provenance="publisher-sitemap")
        with sqlite3.connect(":memory:") as connection:
            init_db(connection)
            save_articles(connection, [rss])
            save_articles(connection, [sitemap])
            count, provenance = connection.execute("SELECT COUNT(*), MAX(provenance) FROM articles").fetchone()
            rolling = load_recent_articles(connection, 60)
        self.assertEqual(count, 1)
        self.assertEqual(provenance, "publisher-sitemap")
        self.assertEqual(len(rolling), 1)


if __name__ == "__main__":
    unittest.main()
