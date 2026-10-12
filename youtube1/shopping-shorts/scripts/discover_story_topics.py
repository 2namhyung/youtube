"""Manual story-first collection and current-task review. Never schedules work."""
import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from apps.api.store import Store
from packages.contracts.story_discovery import StoryCollectionRequest, StoryEvidence, StoryTopicReview, NarrativeIntake
from workers.discovery.story_intake import submit_intake
from scripts.discover_shopping_channels import YouTube
from workers.discovery.story_topics import collect_topics, register_evidence, submit_review, write_report, recover_search_candidates, verify_channel_activity


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--collect", action="store_true")
    parser.add_argument("--recover-search", action="store_true")
    parser.add_argument("--check-channel", action="append", default=[])
    parser.add_argument("--query", action="append", default=[])
    parser.add_argument("--search-budget", type=int, default=6)
    parser.add_argument("--read-budget", type=int, default=100)
    parser.add_argument("--stats-budget", type=int, default=20)
    parser.add_argument("--window-days", type=int, default=7)
    parser.add_argument("--evidence-file", type=Path)
    parser.add_argument("--review-file", type=Path)
    parser.add_argument("--intake-file", type=Path)
    parser.add_argument("--data-root", type=Path, default=Path(os.environ.get("SHOPPING_DATA_DIR", ROOT / "data")))
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    store = Store(args.data_root)
    try:
        if args.recover_search:
            print(json.dumps({"recovered_search_candidates": recover_search_candidates(store)}))
        for path in (args.evidence_file, args.review_file, args.intake_file):
            if path and path.name.lower() in {"api.txt", "pixel.txt", ".env", "credentials.json", "auth.json"}:
                parser.error("Secret file denied")
        if args.evidence_file:
            docs = json.loads(args.evidence_file.read_text(encoding="utf-8"))
            print(json.dumps({"evidence": [{"id": r["id"], "title": r["data"]["title"]}
                 for r in (register_evidence(store, StoryEvidence.model_validate(d)) for d in docs)]}, ensure_ascii=False))
        if args.review_file:
            docs = json.loads(args.review_file.read_text(encoding="utf-8"))
            print(json.dumps({"reviews": [submit_review(store, StoryTopicReview.model_validate(d)) for d in docs]}, ensure_ascii=False))
        if args.intake_file:
            docs = json.loads(args.intake_file.read_text(encoding="utf-8"))
            print(json.dumps({"intakes": [submit_intake(store, NarrativeIntake.model_validate(d))["id"] for d in docs]}))
        if args.collect or args.check_channel:
            key = os.environ.get("YOUTUBE_API_KEY")
            if not key:
                parser.error("YOUTUBE_API_KEY not configured; api.txt is never read")
            request = StoryCollectionRequest(queries=args.query, search_budget=args.search_budget,
                    read_budget=args.read_budget, stats_budget=args.stats_budget, window_days=args.window_days)
            api = YouTube.from_environment(request.read_budget, request.search_budget, request.stats_budget,
                                           state_path=store.root / "youtube-cooldowns.json")
            try:
                if args.check_channel:
                    print(json.dumps(verify_channel_activity(store, api, args.check_channel), ensure_ascii=False))
                if args.collect:
                    print(json.dumps(collect_topics(store, api, request), ensure_ascii=False))
            finally:
                api.close()
        report = write_report(store)
        print(json.dumps({"topics": len(report["topics"]), "candidates": report["candidates_total"],
                          "sources": report["sources_total"], "status_counts": report["status_counts"]}, ensure_ascii=False))
    finally:
        store.close()


if __name__ == "__main__":
    main()
