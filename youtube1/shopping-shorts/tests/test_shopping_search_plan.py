import sqlite3

import httpx
import pytest

from scripts.discover_shopping_channels import (
    BudgetStop,
    DEFINITION,
    SEARCH_QUERIES,
    SEARCH_QUERY_GROUPS,
    YouTube,
    active_channel_video_counts,
    classify,
    commerce_signal,
    refresh_video_statistics,
    search_request_params,
    select_search_queries,
)


def test_generic_review_word_alone_is_not_commerce():
    assert commerce_signal("영화 리뷰", "오늘 감상한 작품") == ("unknown", 1)


def test_two_generic_product_signals_are_probable_commerce():
    signal, hits = commerce_signal("가성비 제품 리뷰", "")
    assert signal == "keyword_probable"
    assert hits >= 2


def test_explicit_shopping_phrase_is_probable_commerce():
    signal, hits = commerce_signal("이번 주 추천템", "")
    assert signal == "keyword_probable"
    assert hits >= 1


def test_search_catalog_has_unique_queries_and_all_product_groups():
    assert len(SEARCH_QUERIES) == len(set(SEARCH_QUERIES))
    assert len(SEARCH_QUERIES) >= 100
    assert {"paid_promotion", "food", "household_goods", "electronics", "beauty", "fashion", "pets"} <= set(SEARCH_QUERY_GROUPS)


def test_paid_promotion_search_filter_is_only_applied_to_proxy_group():
    paid = search_request_params("생활용품 추천 쇼츠", "date", "paid_promotion")
    regular = search_request_params("살림 꿀템", "date", "household_goods")

    assert paid["videoPaidProductPlacement"] == "true"
    assert "videoPaidProductPlacement" not in regular


def test_quota_buckets_are_independent():
    api = YouTube("secret", read_budget=1, search_budget=1, stats_budget=1)
    api.client.close()
    api.client = httpx.Client(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json={"items": []})
    ))
    try:
        api.get("search", {}, bucket="search")
        api.get("videos", {}, bucket="read")
        api.get("videos:batchGetStats", {}, bucket="stats")
        with pytest.raises(BudgetStop, match="search quota budget"):
            api.get("search", {}, bucket="search")
    finally:
        api.close()


def test_batch_stats_refresh_preserves_metadata_and_records_observation():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE videos(
          video_id TEXT PRIMARY KEY, title TEXT, duration_seconds INTEGER, views INTEGER,
          shorts_status TEXT, last_stats_observed TEXT
        );
        CREATE TABLE metric_observations(
          video_id TEXT, observed_at TEXT, views INTEGER, definition TEXT,
          PRIMARY KEY(video_id, observed_at,definition)
        );
        INSERT INTO videos VALUES('v1','original title',30,10,'probable',NULL);
    """)

    class FakeApi:
        def get(self, endpoint, params, bucket="read"):
            assert endpoint == "videos:batchGetStats"
            assert bucket == "stats"
            return {
                "items": [{
                    "id": "v1",
                    "snippet": {"title": "provider title is intentionally ignored"},
                    "contentDetails": {"durationMillis": "45000"},
                    "statistics": {"viewCount": "1234"},
                }],
                "summary": {"failedVideoIds": []},
            }

    result = refresh_video_statistics(FakeApi(), db, "2026-09-23T00:00:00+00:00")
    video = db.execute("SELECT * FROM videos WHERE video_id='v1'").fetchone()
    observation = db.execute("SELECT * FROM metric_observations").fetchone()

    assert result == {"stats_refreshed": 1, "stats_failed": 0, "stats_budget_truncated": False}
    assert video["title"] == "original title"
    assert video["views"] == 1234
    assert video["duration_seconds"] == 45
    assert observation["definition"] == DEFINITION


def test_batch_stats_refresh_prioritizes_never_refreshed_rows():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE videos(
          video_id TEXT PRIMARY KEY, duration_seconds INTEGER, views INTEGER,
          shorts_status TEXT, last_stats_observed TEXT
        );
        CREATE TABLE metric_observations(
          video_id TEXT, observed_at TEXT, views INTEGER, definition TEXT,
          PRIMARY KEY(video_id, observed_at,definition)
        );
        INSERT INTO videos VALUES('already',30,10,'probable','2026-09-23T00:00:00+00:00');
        INSERT INTO videos VALUES('never',30,10,'probable',NULL);
    """)

    class RecordingApi:
        requested = []

        def get(self, endpoint, params, bucket="read"):
            self.requested.extend(params["id"].split(","))
            return {"items": [], "summary": {"failedVideoIds": params["id"].split(",")}}

    api = RecordingApi()
    refresh_video_statistics(api, db, "2026-09-24T00:00:00+00:00")

    assert api.requested == ["never", "already"]


def test_recent_activity_counts_only_videos_within_90_days():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE videos(video_id TEXT PRIMARY KEY,channel_id TEXT,published_at TEXT);
        INSERT INTO videos VALUES('v1','active','2026-09-22T00:00:00Z');
        INSERT INTO videos VALUES('v2','active','2026-08-01T00:00:00Z');
        INSERT INTO videos VALUES('v3','old','2026-05-01T00:00:00Z');
    """)

    counts = active_channel_video_counts(db, "2026-09-23T00:00:00+00:00")

    assert counts == {"active": 2}


def test_classification_excludes_channels_with_fewer_than_five_recent_videos():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.executescript("""
        CREATE TABLE channels(
          channel_id TEXT PRIMARY KEY,title TEXT,description TEXT,country TEXT,
          uploads_playlist_id TEXT,first_seen TEXT,last_seen TEXT,
          discovery_hits INTEGER,backfill_complete INTEGER,next_page_token TEXT
        );
        CREATE TABLE videos(
          video_id TEXT PRIMARY KEY,channel_id TEXT,title TEXT,description TEXT,
          published_at TEXT,duration_seconds INTEGER,views INTEGER,
          paid_product_placement INTEGER,shorts_status TEXT,commerce_signal TEXT,
          commerce_keyword_hits INTEGER,first_observed TEXT,last_observed TEXT,
          definition TEXT,last_stats_observed TEXT
        );
        INSERT INTO channels VALUES('active','active','','KR','p','x','x',1,0,NULL);
        INSERT INTO channels VALUES('inactive','inactive','','KR','p','x','x',1,0,NULL);
    """)
    row = "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    for channel_id, count in (("active", 5), ("inactive", 4)):
        for index in range(count):
            db.execute(
                f"INSERT INTO videos VALUES{row}",
                (f"{channel_id}-{index}", channel_id, "추천템", "", "2026-09-01T00:00:00Z",
                 30, 100, None, "probable", "keyword_probable", 1, "x", "x",
                 DEFINITION, "x"),
            )

    channels, outliers = classify(db, "2026-09-23T00:00:00+00:00")

    assert [channel["channel_id"] for channel in channels] == ["active"]
    assert channels[0]["recent_90d_videos"] == 5
    assert outliers == []


def test_query_rotation_starts_with_category_spread():
    db = sqlite3.connect(":memory:")
    db.row_factory = sqlite3.Row
    db.execute("""CREATE TABLE search_query_runs(
        query TEXT PRIMARY KEY, category TEXT NOT NULL, last_run TEXT,
        run_count INTEGER NOT NULL DEFAULT 0
    )""")
    for category, queries in SEARCH_QUERY_GROUPS.items():
        db.executemany(
            "INSERT INTO search_query_runs(query,category) VALUES(?,?)",
            ((query, category) for query in queries),
        )

    selected = select_search_queries(db, len(SEARCH_QUERY_GROUPS))

    assert len({row["category"] for row in selected}) == len(SEARCH_QUERY_GROUPS)
