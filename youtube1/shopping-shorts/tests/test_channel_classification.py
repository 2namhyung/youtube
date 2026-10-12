import json
from collections import Counter

from scripts.classify_shopping_channels import audit_priority, category_result, load_observations


def test_category_result_uses_dominant_product_group():
    category, ranked = category_result(Counter({"household_goods": 12, "electronics": 4}))

    assert category == "household_goods"
    assert ranked[0]["label"] == "생활·주방용품"


def test_category_result_marks_close_catalogs_as_mixed():
    category, _ = category_result(Counter({"beauty": 10, "fashion": 8}))

    assert category == "mixed_other"


def test_browser_observation_wrapper_is_loaded(tmp_path):
    path = tmp_path / "observations.json"
    expected = [{"channel_id": "channel", "shopping_tag_visible": True}]
    path.write_text(json.dumps({"observations": expected}), encoding="utf-8")

    assert load_observations(path) == expected


def test_audit_priority_rewards_explicit_shopping_intent():
    channel = {"title": "살림 추천템", "description": "쿠팡 제품 링크", "discovery_hits": 3}
    score, reasons = audit_priority(channel, [{"title": "주방 꿀템"}], False, 1)

    assert score > 20
    assert any(reason.startswith("explicit-shopping-phrases:") for reason in reasons)


def test_audit_priority_penalizes_generic_entertainment_without_shopping_intent():
    channel = {"title": "랭킹 채널", "description": "웃긴 영상", "discovery_hits": 3}
    score, reasons = audit_priority(channel, [{"title": "먹방 TOP 5"}], False, 1)

    assert score < 0
    assert any(reason.startswith("ambiguous-content-penalty:") for reason in reasons)


def test_audit_priority_uses_observed_query_precision():
    channel = {"title": "상품 채널", "description": "", "discovery_hits": 3}
    candidates = [{"title": "새 제품"}]
    high, _ = audit_priority(channel, candidates, False, 1, 0.8, 10)
    low, reasons = audit_priority(channel, candidates, False, 1, 0.1, 10)

    assert high > low
    assert "audited-query-precision:0.10/10" in reasons
