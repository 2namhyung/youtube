import tempfile
import unittest
import json
from pathlib import Path
from unittest.mock import patch

from jsonschema import Draft202012Validator

from collect import Article, PROJECT_ENV_PATH, allowed_secret, balanced_article_pool, canonical_url, clamp_lookback_days, collect_naver, collect_rss, deduplicate, export_article_pool, init_db, is_candidate, load_allowed_dotenv, load_editorial_feedback, load_recent_articles, normalize_title, publisher_label, rejected_by_editor, save_articles, score_article


class NewsRadarTests(unittest.TestCase):
    def test_project_env_path_targets_selected_app_env(self):
        self.assertEqual(PROJECT_ENV_PATH, Path(__file__).resolve().parents[3] / ".env")

    def test_lookback_is_clamped_to_safe_thirty_day_window(self):
        self.assertEqual(clamp_lookback_days(0), 1)
        self.assertEqual(clamp_lookback_days(14), 14)
        self.assertEqual(clamp_lookback_days(90), 30)
        self.assertEqual(clamp_lookback_days("invalid"), 30)

    def test_title_normalization_removes_news_labels(self):
        self.assertEqual(normalize_title("[영상] 아파트 주차장 '갑자기' 붕괴"), "아파트주차장갑자기붕괴")

    def test_tracking_parameters_are_removed(self):
        self.assertEqual(
            canonical_url("https://example.com/a?utm_source=x&id=2#top"),
            "https://example.com/a?id=2",
        )

    def test_editorial_feedback_rejects_exact_url_and_normalized_title(self):
        with tempfile.TemporaryDirectory() as directory:
            feedback_path = Path(directory) / "feedback.json"
            feedback_path.write_text(json.dumps({"exclusions": [{
                "url": "https://example.com/rejected?utm_source=test",
                "relatedUrls": ["https://example.com/related"],
                "title": "[단독] 마음에 들지 않는 후보",
            }]}, ensure_ascii=False), encoding="utf-8")
            feedback = load_editorial_feedback(feedback_path)
        self.assertTrue(rejected_by_editor(Article("A", "다른 제목", "https://example.com/rejected", "", ""), feedback))
        self.assertTrue(rejected_by_editor(Article("A", "마음에 들지 않는 후보", "https://example.com/new", "", ""), feedback))
        self.assertTrue(rejected_by_editor(Article("A", "또 다른 제목", "https://example.com/related", "", ""), feedback))
        self.assertFalse(rejected_by_editor(Article("A", "새로운 좋은 후보", "https://example.com/good", "", ""), feedback))

    def test_scoring_rewards_emotion_everyday_and_visual_terms(self):
        article = Article("테스트", "CCTV에 포착된 아파트 주차장 갑자기 붕괴 사고", "https://example.com", "", "")
        scoring = {
            "fear": ["사고", "붕괴"],
            "frustration": ["책임"],
            "absurd": ["갑자기"],
            "everyday": ["아파트", "주차장"],
            "visual": ["CCTV", "포착"],
            "exclude": ["선거"],
        }
        score_article(article, scoring)
        self.assertEqual(article.score, 12)

    def test_exact_duplicate_title_keeps_best_score(self):
        low = Article("A", "[영상] 같은 사고", "https://a.example", "", "", score=2)
        high = Article("B", "같은 사고", "https://b.example", "", "", score=8)
        result = deduplicate([low, high])
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0].score, 8)

    def test_candidate_needs_emotion_and_everyday_signal(self):
        relevant = Article(
            "A", "아파트 주차장 갑자기 폭행 피해자", "https://a.example", "", "",
            score=8, fear=2, frustration=1, absurd=1, everyday=2,
        )
        generic = Article("B", "편의점 절도 사건 용의자 검거", "https://b.example", "", "", score=8, frustration=2, everyday=1)
        self.assertTrue(is_candidate(relevant, 4))
        self.assertFalse(is_candidate(generic, 4))

    def test_user_editorial_examples_pass_but_generic_crime_does_not(self):
        config_path = Path(__file__).with_name("config.json")
        scoring = json.loads(config_path.read_text(encoding="utf-8"))["scoring"]
        examples = [
            "커피 리필을 거절하자 카페 업주 폭행",
            "경적 한 번에 주택가에서 흉기 휘둘러",
            "아파트 소화전에 마약 은닉",
            "학교 교사 텀블러에 체액 오염",
            "7천만원 신차에서 벌레와 새 둥지 흔적",
            "온라인 쇼핑 위조 배터리 폭발 위험 판매자 연락두절",
        ]
        for index, title in enumerate(examples):
            article = score_article(Article("예시", title, f"https://example.com/{index}", "", ""), scoring)
            self.assertTrue(is_candidate(article, 4), title)

        generic = score_article(Article("예시", "상습 절도범 검거 경찰 수사", "https://example.com/generic", "", ""), scoring)
        self.assertFalse(is_candidate(generic, 4))

    def test_rss_parser_handles_atom_links_and_skips_incomplete_items(self):
        payload = '''<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
          <entry><title>아파트 주차장 폭행</title><link href="https://example.com/a?utm_source=x"/>
          <updated>2026-07-27T00:00:00Z</updated><summary>설명</summary></entry>
          <entry><title>누락 링크</title></entry></feed>'''.encode("utf-8")
        with patch("collect.fetch_bytes", return_value=payload):
            rows = collect_rss({"name": "테스트", "url": "https://feed.example", "enabled": True})
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].url, "https://example.com/a")

    def test_config_contains_multiple_verified_publishers(self):
        config_path = Path(__file__).with_name("config.json")
        config = json.loads(config_path.read_text(encoding="utf-8"))
        hosts = {item["url"].split("/")[2] for item in config["rss_sources"]}
        self.assertGreaterEqual(len(hosts), 3)
        self.assertIn("news.sbs.co.kr", hosts)
        self.assertIn("www.mbn.co.kr", hosts)
        self.assertIn("https://nwww.newsis.com/RSS/country.xml", {item["url"] for item in config["rss_sources"]})
        self.assertEqual(config["acquisition"]["primary"], "publisher_feeds")
        self.assertTrue(config["naver_search"]["enabled"])
        self.assertFalse(config["acquisition"]["semantic_inference_on_collect"])
        self.assertEqual(config["lookback_days"], 30)
        self.assertEqual(config["daily_article_limit"], 100)
        self.assertEqual(config["article_pool_limit"], 3000)
        self.assertEqual(config["collection_delta_output"], "data/latest_collection_delta.json")
        self.assertGreaterEqual(len(hosts), 8)
        self.assertIn("www.yna.co.kr", hosts)
        self.assertIn("news-ex.jtbc.co.kr", hosts)
        self.assertIn("www.chosun.com", hosts)
        self.assertIn("www.hankyung.com", hosts)
        self.assertIn("www.hani.co.kr", hosts)
        historical = config["historical_sources"]
        nownews = next(item for item in historical if item["allowed_hosts"] == ["nownews.seoul.co.kr"])
        self.assertEqual(nownews["adapter"], "html-daily-archive")
        self.assertNotIn("query", json.dumps(nownews).lower())

    def test_naver_original_link_uses_publisher_host_and_portal_fallback_is_not_authority(self):
        payload = json.dumps({"items": [
            {
                "title": "<b>빵집 흡연 제지 어깨 충돌</b>",
                "originallink": "https://www.publisher.example/article?id=1&utm_source=naver",
                "link": "https://n.news.naver.com/article/999",
                "description": "원문 설명",
                "pubDate": "Tue, 02 Aug 2026 09:00:00 +0900",
            },
            {
                "title": "포털 미러만 있는 기사",
                "originallink": "",
                "link": "https://news.naver.com/main/read.naver?oid=999&aid=1",
                "description": "원문 미확인",
                "pubDate": "Tue, 02 Aug 2026 08:00:00 +0900",
            },
        ]}).encode("utf-8")
        with patch.dict("os.environ", {"NAVER_CLIENT_ID": "id", "NAVER_CLIENT_SECRET": "secret"}, clear=False), patch("collect.fetch_bytes", return_value=payload):
            rows = collect_naver(["빵집 흡연 제지"])
        self.assertEqual(rows[0].source, "publisher.example")
        self.assertEqual(rows[0].provenance, "publisher-original-link:naver-search")
        self.assertEqual(rows[1].source, "portal:naver")
        self.assertEqual(rows[1].provenance, "aggregator-naver-search-unresolved")
        self.assertEqual(publisher_label("https://www.publisher.example/story"), "publisher.example")

    def test_dotenv_loader_accepts_quoted_allowed_keys_and_ignores_malformed_or_unknown_lines(self):
        with tempfile.TemporaryDirectory() as directory:
            env_path = Path(directory) / ".env"
            env_path.write_text(
                '# comment\nexport NAVER_CLIENT_ID="quoted-client" # trailing comment\n'
                "NAVER_CLIENT_SECRET='quoted-secret'\nKAKAO_API_KEY=plain-key\n"
                "NOT_ALLOWED=must-not-load\nNAVER_API_HUB_CLIENT_ID=\"unterminated\nMALFORMED_LINE\n",
                encoding="utf-8",
            )
            values = load_allowed_dotenv(env_path)
        self.assertEqual(values["NAVER_CLIENT_ID"], "quoted-client")
        self.assertEqual(values["NAVER_CLIENT_SECRET"], "quoted-secret")
        self.assertEqual(values["KAKAO_API_KEY"], "plain-key")
        self.assertNotIn("NOT_ALLOWED", values)
        self.assertNotIn("NAVER_API_HUB_CLIENT_ID", values)

    def test_dotenv_loader_fails_closed_for_oversized_or_missing_paths_and_process_env_wins(self):
        with tempfile.TemporaryDirectory() as directory:
            oversized = Path(directory) / ".env"
            oversized.write_bytes(b"NAVER_CLIENT_ID=" + b"x" * (64 * 1024))
            self.assertEqual(load_allowed_dotenv(oversized), {})
            self.assertEqual(load_allowed_dotenv(Path(directory) / "missing.env"), {})
            valid = Path(directory) / "valid.env"
            valid.write_text("NAVER_CLIENT_ID=from-file\n", encoding="utf-8")
            values = load_allowed_dotenv(valid)
        with patch.dict("os.environ", {"NAVER_CLIENT_ID": "from-process"}, clear=False):
            self.assertEqual(allowed_secret("NAVER_CLIENT_ID", values), "from-process")
        self.assertEqual(allowed_secret("UNAPPROVED_KEY", values), "")

    def test_article_pool_v2_preserves_bounded_sanitized_feed_excerpt(self):
        rows = [
            Article("A", "경적 뒤 권총 위협", "https://example.com/a", "2026-07-27T10:00:00+09:00", "2026-07-27T10:01:00+09:00", score=0, signal_text="본문처럼 취급하지 않을 RSS 요약"),
            Article("B", "일상 뉴스", "https://example.com/b", "2026-07-27T09:00:00+09:00", "2026-07-27T10:01:00+09:00", score=0),
        ]
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "pool.json"
            self.assertEqual(export_article_pool(output, rows, 3000, excerpt_limit=12), 2)
            payload = json.loads(output.read_text(encoding="utf-8"))
        self.assertEqual(payload["version"], 3)
        self.assertEqual(payload["rolling_window_days"], 30)
        self.assertEqual(payload["daily_article_limit"], 100)
        self.assertEqual(payload["covered_day_count"], 1)
        self.assertEqual(payload["daily_counts"], {"2026-07-27": 2})
        self.assertFalse(payload["full_bodies_included"])
        self.assertTrue(payload["metadata_only"])
        self.assertEqual(payload["content_scope"], "publisher-feed-and-sitemap-metadata-with-bounded-excerpt")
        self.assertEqual([item["url"] for item in payload["articles"]], ["https://example.com/a", "https://example.com/b"])
        self.assertLessEqual(len(payload["articles"][0]["feed_excerpt"]), 12)
        self.assertEqual(payload["articles"][0]["excerpt_provenance"], "rss-description-or-atom-summary")
        self.assertNotIn("description", payload["articles"][0])
        schema = json.loads(Path(__file__).with_name("article-pool.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(list(Draft202012Validator(schema).iter_errors(payload)), [])

    def test_balanced_pool_caps_each_korean_calendar_day_before_global_limit(self):
        rows = []
        for day in range(1, 4):
            for index in range(0, 130):
                rows.append(Article(
                    f"Desk {index % 4}",
                    f"Day {day} article {index}",
                    f"https://example.com/{day}/{index}",
                    f"2026-07-{day:02d}T{index % 24:02d}:00:00+09:00",
                    f"2026-07-{day:02d}T23:59:00+09:00",
                ))
        selected, day_counts = balanced_article_pool(rows, 3000, 100)
        self.assertEqual(len(selected), 300)
        self.assertEqual(day_counts, {
            "2026-07-03": 100,
            "2026-07-02": 100,
            "2026-07-01": 100,
        })
        self.assertLessEqual(max(day_counts.values()), 100)

    def test_balanced_pool_enforces_global_three_thousand_cap(self):
        rows = [
            Article(
                "Desk",
                f"Article {day}-{index}",
                f"https://example.com/{day}/{index}",
                f"2026-07-{day:02d}T12:00:00+09:00",
                f"2026-07-{day:02d}T12:01:00+09:00",
            )
            for day in range(1, 32)
            for index in range(0, 100)
        ]
        selected, day_counts = balanced_article_pool(rows, 3000, 100)
        self.assertEqual(len(selected), 3000)
        self.assertEqual(len(day_counts), 30)
        self.assertTrue(all(count == 100 for count in day_counts.values()))

    def test_rss_excerpt_is_html_stripped_before_export(self):
        payload = b'''<rss><channel><item><title>Safe title</title><link>https://example.com/a</link><description>&lt;b&gt;Lead&lt;/b&gt;   detail</description></item></channel></rss>'''
        with patch("collect.fetch_bytes", return_value=payload):
            rows = collect_rss({"name": "Desk", "url": "https://feed.example"})
        self.assertEqual(rows[0].signal_text, "Lead detail")

    def test_database_migrates_legacy_schema_with_signal_text(self):
        import sqlite3
        with sqlite3.connect(":memory:") as connection:
            connection.execute("CREATE TABLE articles (article_id TEXT PRIMARY KEY, source TEXT NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, published_at TEXT, collected_at TEXT NOT NULL, score INTEGER NOT NULL, fear INTEGER NOT NULL, frustration INTEGER NOT NULL, absurd INTEGER NOT NULL, everyday INTEGER NOT NULL, visual INTEGER NOT NULL, excluded INTEGER NOT NULL, matched_keywords TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '')")
            init_db(connection)
            columns = {row[1] for row in connection.execute("PRAGMA table_info(articles)")}
        self.assertIn("signal_text", columns)

    def test_rolling_pool_loads_prior_snapshot_inside_lookback(self):
        import sqlite3
        from datetime import datetime, timedelta
        now = datetime.now().astimezone()
        current = Article("Desk A", "Current snapshot", "https://example.com/current", now.isoformat(), now.isoformat(), signal_text="current excerpt")
        prior = Article("Desk B", "Prior snapshot", "https://example.com/prior", (now - timedelta(days=2)).isoformat(), (now - timedelta(days=2)).isoformat(), signal_text="prior excerpt")
        expired = Article("Desk C", "Expired snapshot", "https://example.com/expired", (now - timedelta(days=20)).isoformat(), now.isoformat())
        undated_expired = Article("Desk D", "Undated expired", "https://example.com/undated-expired", "", (now - timedelta(days=20)).isoformat())
        with sqlite3.connect(":memory:") as connection:
            init_db(connection)
            save_articles(connection, [prior, expired, undated_expired])
            save_articles(connection, [current])
            rolling = load_recent_articles(connection, 14)
        self.assertEqual({article.url for article in rolling}, {current.url, prior.url})
        self.assertEqual(next(article for article in rolling if article.url == prior.url).signal_text, "prior excerpt")

    def test_article_update_keeps_existing_excerpt_when_new_feed_omits_it(self):
        import sqlite3
        now = "2026-07-27T10:00:00+09:00"
        original = Article("Desk", "Same title", "https://example.com/a", "", now, signal_text="bounded context")
        refreshed = Article("Desk", "Same title", "https://example.com/a", now, now, signal_text="")
        with sqlite3.connect(":memory:") as connection:
            init_db(connection)
            save_articles(connection, [original])
            save_articles(connection, [refreshed])
            row = connection.execute("SELECT published_at, signal_text FROM articles").fetchone()
        self.assertEqual(row, (now, "bounded context"))

    def test_undated_article_keeps_first_collection_time_for_expiry(self):
        import sqlite3
        original = Article("Desk", "Undated", "https://example.com/undated", "", "2026-07-01T10:00:00+09:00")
        refreshed = Article("Desk", "Undated", "https://example.com/undated", "", "2026-07-27T10:00:00+09:00")
        with sqlite3.connect(":memory:") as connection:
            init_db(connection)
            save_articles(connection, [original])
            save_articles(connection, [refreshed])
            row = connection.execute("SELECT published_at, collected_at FROM articles").fetchone()
        self.assertEqual(row, ("", original.collected_at))


if __name__ == "__main__":
    unittest.main()
