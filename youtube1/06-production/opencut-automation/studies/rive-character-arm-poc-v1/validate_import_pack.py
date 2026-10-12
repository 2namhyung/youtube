from hashlib import sha256
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "rive-import-manifest.json"


def digest(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def main() -> None:
    m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    assert m["schema"] == "rive-character-import-pack-v1"
    assert m["status"] == "private-editor-import-ready"
    assert m["productionApproved"] is False
    assert m["hierarchy"]["exactlyOneVisibleArmPerSide"] is True
    required = {"torso", "arm_l", "arm_r", "hand_relaxed_l", "hand_relaxed_r"}
    layers = {item["slot"]: item for item in m["layers"]}
    assert set(layers) == required
    assert layers["torso"]["semanticRole"] == "body-shell-no-arms-or-sleeves"
    assert layers["arm_l"]["semanticRole"] == "continuous-shoulder-to-wrist-sleeve"
    assert layers["arm_r"]["semanticRole"] == "continuous-shoulder-to-wrist-sleeve"
    assert m["hierarchy"]["drawOrderBackToFront"] == ["arm_l", "arm_r", "torso", "hand_relaxed_l", "hand_relaxed_r"]
    for item in layers.values():
        path = (ROOT / item["path"]).resolve()
        assert path.is_relative_to(ROOT.resolve())
        assert path.is_file() and not path.is_symlink()
        assert digest(path) == item["sha256"]
        image = Image.open(path).convert("RGBA")
        assert image.size == (1024, 1536)
        assert list(image.getchannel("A").getbbox()) == item["alphaBounds"]
        assert item["origin"] == [0, 0]
    for item in m["review"].values():
        if isinstance(item, dict):
            path = (ROOT / item["path"]).resolve()
            assert path.is_file() and not path.is_symlink()
            assert digest(path) == item["sha256"]
    assert m["review"]["riveEditorMeshWeights"] == "pending"
    assert m["review"]["extremePoseSeamQa"] == "pending"
    print("Rive import pack valid: torso/arms/hands, hashes, full-canvas origins and draw order pass")


if __name__ == "__main__":
    main()
