from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "front-design-gate-v1.json"


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if data["productionApproved"] is not False:
        raise ValueError("design gate must remain production-unapproved")
    for section, path_key, hash_key in (
        ("source", "path", "sha256"),
        ("review", "overlayPath", "overlaySha256"),
        ("review", "cropPath", "cropSha256"),
    ):
        path = (ROOT / data[section][path_key]).resolve()
        if path.is_symlink() or not path.is_file() or ROOT.resolve() not in path.parents:
            raise ValueError(f"unsafe or missing path: {path}")
        if digest(path) != data[section][hash_key]:
            raise ValueError(f"hash mismatch: {path}")
        with Image.open(path) as image:
            image.verify()
    m = data["measurements"]
    if not 4.8 <= m["headsTall"] <= 5.5:
        raise ValueError("adult editorial proportion is outside the approved review band")
    if not 1.0 <= m["upperArmToForearmRatio"] <= 1.5:
        raise ValueError("arm segment ratio is outside the review band")
    print(
        f"landmark review valid: {m['headsTall']} heads tall, "
        f"upper-arm/forearm={m['upperArmToForearmRatio']}"
    )


if __name__ == "__main__":
    main()

