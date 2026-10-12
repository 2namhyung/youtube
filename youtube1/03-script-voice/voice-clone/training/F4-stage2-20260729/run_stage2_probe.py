"""Reuse the fixed F4 probe contract with stricter stage-2 thermal limits."""

from __future__ import annotations

import importlib.util
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT.parent / "F4-target-20260729" / "run_target_probe.py"
spec = importlib.util.spec_from_file_location("f4_target_probe", SOURCE)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)
module.RUN_ROOT = ROOT.parents[3] / "03-script-voice" / "runs" / "F4-stage2-20260729" / "probes"
module.START_LIMIT = 52
module.HARD_LIMIT = 74
module.POLL_INTERVAL = 0.5
module.main()
