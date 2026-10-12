"""Report the configured local WISE service without exposing credentials."""

from __future__ import annotations

import argparse
import json
import sys

from backend.wise import WiseClient


def main() -> int:
    parser = argparse.ArgumentParser(description="Probe an Oxford VGG WISE loopback service")
    parser.add_argument("--url", default=None, help="loopback WISE URL; defaults to WISE_URL")
    args = parser.parse_args()
    print(json.dumps(WiseClient(args.url).status(), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

