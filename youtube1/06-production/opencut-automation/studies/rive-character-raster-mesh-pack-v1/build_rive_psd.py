from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor"))

import numpy as np
from PIL import Image
from pytoshop import enums
from pytoshop.user import nested_layers


MANIFEST_PATH = ROOT / "manifest.json"
PSD_DIR = ROOT / "rive"
PSD_PATH = PSD_DIR / "char_anon01_front_upper_body-v1.psd"
PSD_MANIFEST_PATH = PSD_DIR / "psd-manifest.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    width, height = manifest["canvas"]
    by_slot = {layer["slot"]: layer for layer in manifest["layers"]}

    # PSD/Rive displays the first item at the top. This reverses the pack's
    # explicit back-to-front compositing order.
    top_to_bottom = list(reversed(manifest["drawOrderBackToFront"]))
    psd_layers = []
    layer_records = []
    for slot in top_to_bottom:
        record = by_slot[slot]
        source_path = (ROOT / record["path"]).resolve()
        rgba = np.asarray(Image.open(source_path).convert("RGBA"), dtype=np.uint8)
        if rgba.shape != (height, width, 4):
            raise RuntimeError(f"{slot}: unexpected RGBA shape {rgba.shape}")
        layer_name = f"char_anon01_front_{slot}"
        channels = {
            enums.ChannelId.red: rgba[:, :, 0],
            enums.ChannelId.green: rgba[:, :, 1],
            enums.ChannelId.blue: rgba[:, :, 2],
            enums.ChannelId.transparency: rgba[:, :, 3],
        }
        psd_layers.append(
            nested_layers.Image(
                name=layer_name,
                top=0,
                left=0,
                bottom=height,
                right=width,
                channels=channels,
                color_mode=enums.ColorMode.rgb,
            )
        )
        layer_records.append(
            {
                "slot": slot,
                "name": layer_name,
                "sourcePath": record["path"],
                "sourceSha256": record["sha256"],
                "origin": [0, 0],
                "dimensions": [width, height],
            }
        )

    psd = nested_layers.nested_layers_to_psd(
        psd_layers,
        enums.ColorMode.rgb,
        # RAW avoids pytoshop's optional third-party PackBits dependency and
        # preserves every channel byte exactly for the Rive import handoff.
        compression=enums.Compression.raw,
        depth=enums.ColorDepth.depth8,
        # pytoshop 1.2.1 assigns this tuple internally as (width, height),
        # despite the docstring describing (height, width).
        size=(width, height),
    )
    PSD_DIR.mkdir(parents=True, exist_ok=True)
    with PSD_PATH.open("wb") as handle:
        psd.write(handle)

    psd_manifest = {
        "schema": "rive-layered-psd-handoff-v1",
        "status": "private-rive-import-candidate",
        "productionApproved": False,
        "sourceManifest": {
            "path": "../manifest.json",
            "sha256": sha256(MANIFEST_PATH),
        },
        "psd": {
            "path": PSD_PATH.name,
            "sha256": sha256(PSD_PATH),
            "bytes": PSD_PATH.stat().st_size,
            "signature": "8BPS",
            "colorMode": "RGB",
            "depth": 8,
            "dimensions": [width, height],
        },
        "layerOrderTopToBottom": top_to_bottom,
        "layers": layer_records,
        "riveImportGate": {
            "scope": "left-arm-only-mesh-proof",
            "meshLayer": "char_anon01_front_arm_l",
            "rigidLayer": "char_anon01_front_hand_l",
            "requiredBones": ["shoulder_l", "elbow_l", "wrist_l"],
            "blockedUntil": "owner-signed-in-rive-editor-and-import-review",
        },
    }
    PSD_MANIFEST_PATH.write_text(
        json.dumps(psd_manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"built layered PSD: {PSD_PATH.name}, {len(layer_records)} layers, "
        f"{width}x{height}"
    )


if __name__ == "__main__":
    main()
