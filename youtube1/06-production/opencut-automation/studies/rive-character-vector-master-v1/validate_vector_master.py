from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image


ROOT = Path(__file__).resolve().parent
SVG = ROOT / "source" / "front-vector-master-v1.svg"
PREVIEW = ROOT / "review" / "front-vector-master-v1.png"
REPORT = ROOT / "vector-master-report.json"
REQUIRED_GROUPS = {"legs", "arms", "torso", "neck_head", "hands", "face"}


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def main() -> None:
    if SVG.is_symlink() or PREVIEW.is_symlink() or not SVG.is_file() or not PREVIEW.is_file():
        raise ValueError("physical SVG and preview are required")
    root = ET.parse(SVG).getroot()
    ids = {node.attrib.get("id") for node in root.iter() if node.attrib.get("id")}
    missing = sorted(REQUIRED_GROUPS - ids)
    if missing:
        raise ValueError(f"missing semantic groups: {missing}")
    if any(node.tag.endswith("image") for node in root.iter()):
        raise ValueError("embedded raster images are prohibited")
    torso = next(node for node in root.iter() if node.attrib.get("id") == "torso")
    torso_ids = {node.attrib.get("id", "") for node in torso.iter()}
    if any("arm" in value or "sleeve" in value for value in torso_ids):
        raise ValueError("torso contains an arm or sleeve element")
    arms = next(node for node in root.iter() if node.attrib.get("id") == "arms")
    arm_ids = {node.attrib.get("id") for node in arms.iter()}
    if not {"arm_l", "arm_r"}.issubset(arm_ids):
        raise ValueError("both continuous arm paths are required")
    with Image.open(PREVIEW) as image:
        if image.size != (1024, 1536):
            raise ValueError(f"unexpected preview size: {image.size}")
        image.verify()
    report = {
        "schema": "rive-vector-master-report-v1",
        "status": "technical-structure-pass-visual-review-pending",
        "productionApproved": False,
        "svg": {"path": SVG.relative_to(ROOT).as_posix(), "sha256": digest(SVG)},
        "preview": {"path": PREVIEW.relative_to(ROOT).as_posix(), "sha256": digest(PREVIEW)},
        "semanticGroups": sorted(REQUIRED_GROUPS),
        "embeddedRasterCount": 0,
        "torsoContainsSleeve": False,
        "visualKnownIssues": [
            "shoulder silhouette is more angular than the preferred raster design",
            "face and clothing finish do not yet match the preferred raster design",
            "not authorized as a replacement design authority",
        ],
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("vector master structure valid: 6 groups, no raster, arm-free torso, 2 arm paths")


if __name__ == "__main__":
    main()

