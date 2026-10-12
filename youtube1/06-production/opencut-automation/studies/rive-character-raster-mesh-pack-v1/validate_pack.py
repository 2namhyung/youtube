from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def main() -> None:
    data = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    if data["productionApproved"] is not False:
        raise ValueError("private pack cannot be production approved")
    if data["drawOrderBackToFront"] != ["arm_l", "arm_r", "torso", "hand_l", "hand_r"]:
        raise ValueError("invalid draw order")
    if {row["slot"] for row in data["layers"]} != {"torso", "arm_l", "arm_r", "hand_l", "hand_r"}:
        raise ValueError("exactly five required slots are required")
    for row in data["layers"]:
        path = (ROOT / row["path"]).resolve()
        if not path.is_file() or path.is_symlink() or ROOT.resolve() not in path.parents:
            raise ValueError(f"unsafe layer: {path}")
        if digest(path) != row["sha256"]:
            raise ValueError(f"hash mismatch: {path}")
        with Image.open(path) as image:
            if image.mode != "RGBA" or image.size != (361, 949):
                raise ValueError(f"invalid layer format: {path}")
            if image.getchannel("A").getbbox() is None:
                raise ValueError(f"empty layer: {path}")
    print("raster mesh pack valid: 5 physical RGBA layers, hashes, canvas and draw order pass")


if __name__ == "__main__":
    main()

