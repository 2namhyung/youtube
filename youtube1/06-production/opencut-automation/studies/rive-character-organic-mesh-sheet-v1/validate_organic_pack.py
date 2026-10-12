from hashlib import sha256
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "organic-mesh-report.json"


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def main() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert report["schema"] == "rive-organic-mesh-pack-report-v1"
    assert report["status"] == "private-review-candidate"
    assert report["productionApproved"] is False
    torso_replacement = report["torsoReplacement"]
    torso_path = (ROOT / torso_replacement["path"]).resolve()
    assert torso_path.is_relative_to(ROOT.resolve())
    assert torso_path.is_file() and not torso_path.is_symlink()
    assert digest(torso_path) == torso_replacement["sha256"]
    assert torso_replacement["semanticContract"] == "arm-free-neck-to-waist-body-shell"
    assert torso_replacement["supersedes"] == "source-sheet-torso-with-baked-sleeves"
    assert Image.open(torso_path).convert("RGBA").getchannel("A").getbbox() is not None
    assert len(report["parts"]) == 20
    assert len({part["name"] for part in report["parts"]}) == 20
    for part in report["parts"]:
        path = (ROOT / part["path"]).resolve()
        assert path.is_relative_to(ROOT.resolve())
        assert path.is_file() and not path.is_symlink()
        assert digest(path) == part["sha256"]
        image = Image.open(path).convert("RGBA")
        assert image.size == (320, 256)
        box = image.getchannel("A").getbbox()
        assert box is not None and list(box) == part["alphaBounds"]
        assert part["safeInset24"] is True
    for key, size in (("atlas", (1600, 1024)), ("assembly", (1024, 1536))):
        item = report[key]
        path = (ROOT / item["path"]).resolve()
        assert path.is_file() and not path.is_symlink()
        assert digest(path) == item["sha256"]
        assert Image.open(path).size == size
    checks = report["checks"]
    assert checks["partCount"] == 20
    assert checks["allSafeInset24"] is True
    assert checks["physicalNonsymlink"] is True
    assert checks["visibleElbowKneeAnkleCuts"] is False
    assert checks["visualQa"] == "pending-human-review"
    print("organic mesh pack valid: 20 parts, inset, hashes, dimensions and private status pass")


if __name__ == "__main__":
    main()
