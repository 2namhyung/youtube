from hashlib import sha256
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "parts-v3-report.json"


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def main() -> None:
    report = json.loads(REPORT.read_text(encoding="utf-8"))
    assert report["schema"] == "rive-character-parts-sheet-report-v1"
    assert report["status"] == "private-review-candidate"
    assert report["productionApproved"] is False
    assert len(report["parts"]) == 24
    names = [p["name"] for p in report["parts"]]
    assert len(names) == len(set(names))
    for record in report["parts"]:
        path = (ROOT / record["path"]).resolve()
        assert path.is_relative_to(ROOT.resolve())
        assert path.is_file() and not path.is_symlink()
        assert digest(path) == record["sha256"]
        image = Image.open(path).convert("RGBA")
        assert image.size == (256, 256)
        box = image.getchannel("A").getbbox()
        assert box is not None and list(box) == record["alphaBounds"]
        assert box[0] >= 24 and box[1] >= 24 and box[2] <= 232 and box[3] <= 232
    for key, size in (("atlas", (1536, 1024)), ("assembly", (1024, 1536))):
        record = report[key]
        path = (ROOT / record["path"]).resolve()
        assert path.is_relative_to(ROOT.resolve())
        assert path.is_file() and not path.is_symlink()
        assert digest(path) == record["sha256"]
        assert Image.open(path).size == size
    assert report["checks"] == {
        "partCount": 24,
        "allSafeInset24": True,
        "physicalNonsymlink": True,
        "visualQa": "pending-human-review",
    }
    print("rive parts v3 valid: 24 RGBA parts, safe inset, hashes and private status pass")


if __name__ == "__main__":
    main()
