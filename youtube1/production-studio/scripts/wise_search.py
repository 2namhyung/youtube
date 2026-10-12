"""Run a WISE search against the acquired local media index."""

from __future__ import annotations

import argparse
import json

from backend.media import MediaLibrary
from backend.wise import WiseClient, WiseUnavailable, WiseProtocolError


def main() -> int:
    parser = argparse.ArgumentParser(description="Search the configured local WISE collection")
    parser.add_argument("query")
    parser.add_argument("--top-k", type=int, default=10)
    parser.add_argument("--url", default=None)
    args = parser.parse_args()
    library = MediaLibrary()
    index = {record.id: record.to_dict() for record in library.list()}
    try:
        result = WiseClient(args.url).search(args.query, args.top_k, index)
    except (WiseUnavailable, WiseProtocolError, ValueError) as exc:
        result = {"status": "offline", "reason": str(exc), "results": [], "unresolved": []}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

