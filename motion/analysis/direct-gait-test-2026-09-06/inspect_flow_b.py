"""Run the Flow B raw-gait inspection without changing the Flow A record."""
from __future__ import annotations

import importlib.util
import json
from datetime import datetime, timezone
from pathlib import Path


HERE = Path(__file__).resolve().parent
FLOW = HERE / "flow-direct-gait-B-10s.mp4"
BASELINE = HERE / "canonical-hanbok-1.00x-2s.mp4"
FAST = HERE / "canonical-hanbok-1.80x-2s.mp4"
HELPER_PATH = HERE / "inspect_flow_a.py"


def load_helper():
    spec = importlib.util.spec_from_file_location("flow_a_inspector_for_b", HELPER_PATH)
    if spec is None or spec.loader is None:
        raise ImportError(HELPER_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    helper = load_helper()
    helper.FLOW = FLOW
    flow_extract = HERE / "flow-direct-gait-B-source2.5-2s.mp4"
    comparison = HERE / "direct-gait-original1.00x-flowB-original1.80x-2s.mp4"
    contact = HERE / "direct-gait-flowB-head-feet-contact.jpg"
    helper.extract_flow(flow_extract)
    paths = [("original 1.00x", BASELINE), ("Flow B raw", flow_extract), ("original 1.80x", FAST)]
    helper.make_comparison(paths, comparison)
    helper.make_contact(paths, contact)
    for _, path in paths:
        helper.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "null", "-"])
    helper.run(["ffmpeg", "-v", "error", "-i", str(comparison), "-f", "null", "-"])
    metadata = {
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "purpose": "Raw Flow B gait inspection at source 2.5s against unchanged local 1.00x and 1.80x candidates",
        "flow_input": {"path": str(FLOW), "downloaded_raw_preserved": True, "probe": helper.probe(FLOW), "sha256": helper.sha256(FLOW)},
        "window": {"source_start_seconds": 2.5, "output_seconds": 2.0, "fps": 24, "frames": 48,
                    "flow_extract": "2.5–4.5s raw normal playback; no retime"},
        "comparison": {"columns": ["original 1.00x", "Flow B raw", "original 1.80x"],
                       "resize_only_for_comparison": True, "width": 1440, "height": 852,
                       "fps": 24, "frames": 48, "seconds": 2.0},
        "foot_phase": {"status": "NOT_MEASURABLE", "reason": "visual contact sheet only; clothing hem and generated take differences prevent reliable left/right contact and trajectory tracking"},
        "head_feet_contact": {"status": "visual_review_artifact", "exact_eye_gaze": "UNKNOWN"},
        "artifacts": {},
        "limits": ["Flow B is kept at raw normal playback", "comparison resize does not alter playback speed", "no claim that Flow universally changes gait", "no card/head/matte/production changes"],
    }
    for path in (FLOW, BASELINE, FAST, flow_extract, comparison, contact):
        metadata["artifacts"][str(path)] = {"sha256": helper.sha256(path), "bytes": path.stat().st_size,
                                             "probe": helper.probe(path) if path.suffix.lower() == ".mp4" else None}
    (HERE / "flow-b-metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (HERE / "flow-b-README.md").write_text(
        "# Flow B direct-gait inspection\n\n"
        "Flow B is preserved as a raw 10-second download. The extracted review window is source 2.5–4.5s at normal playback, 720×1280/24fps/48 frames. The three-column comparison is original 1.00×, Flow B raw, and original 1.80×; only comparison panels are resized to 480×852.\n\n"
        "- [Raw Flow B copy](flow-direct-gait-B-10s.mp4)\n"
        "- [Flow B source 2.5–4.5s](flow-direct-gait-B-source2.5-2s.mp4)\n"
        "- [Three-column comparison](direct-gait-original1.00x-flowB-original1.80x-2s.mp4)\n"
        "- [Head/feet contact sheet](direct-gait-flowB-head-feet-contact.jpg)\n"
        "- [Metadata](flow-b-metadata.json)\n"
        "- [Inspection script](inspect_flow_b.py)\n"
        "- [Concise result report](FLOW_B_REPORT.md)\n\n"
        "Selected-frame visual review cannot establish left/right foot-contact period or exact eye gaze; both remain NOT_MEASURABLE/UNKNOWN. Flow B remains raw normal playback, so no universal Flow gait claim is made. All review MP4s were ffmpeg-decoded; no source, production, Flow, upload, or wiki file was modified.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
