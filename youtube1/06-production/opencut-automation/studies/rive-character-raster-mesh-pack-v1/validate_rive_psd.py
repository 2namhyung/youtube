from __future__ import annotations

import hashlib
import io
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "vendor"))

import numpy as np
from PIL import Image
from pytoshop import core, enums
from pytoshop.user import nested_layers


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fail(message: str) -> None:
    raise SystemExit(f"PSD validation failed: {message}")


def channel_array(layer: nested_layers.Image, channel_id: enums.ChannelId) -> np.ndarray:
    channel = layer.channels.get(channel_id)
    if channel is None:
        fail(f"{layer.name}: missing channel {channel_id}")
    if hasattr(channel, "image"):
        channel = channel.image
    return np.asarray(channel, dtype=np.uint8)


def main() -> None:
    handoff_path = ROOT / "rive" / "psd-manifest.json"
    handoff = json.loads(handoff_path.read_text(encoding="utf-8"))
    if handoff["productionApproved"] is not False:
        fail("private candidate must not be production approved")

    psd_path = (handoff_path.parent / handoff["psd"]["path"]).resolve()
    if psd_path.parent != handoff_path.parent.resolve():
        fail("PSD escaped the handoff directory")
    if psd_path.is_symlink() or os.path.islink(psd_path):
        fail("PSD must be a physical nonsymlink")
    if not psd_path.is_file():
        fail("PSD is missing")
    if sha256(psd_path) != handoff["psd"]["sha256"]:
        fail("PSD hash mismatch")
    psd_bytes = psd_path.read_bytes()
    if psd_bytes[:4] != b"8BPS":
        fail("PSD signature mismatch")
    # pytoshop decodes channel pixels lazily, so the backing stream must stay
    # alive until all source comparisons below have completed.
    handle = io.BytesIO(psd_bytes)
    psd = core.PsdFile.read(handle)

    width, height = handoff["psd"]["dimensions"]
    if [psd.width, psd.height] != [width, height]:
        fail("PSD dimensions mismatch")
    if psd.color_mode != enums.ColorMode.rgb or psd.depth != 8:
        fail("PSD must be 8-bit RGB")

    decoded = nested_layers.psd_to_nested_layers(psd)
    expected_names = [record["name"] for record in handoff["layers"]]
    decoded_names = [layer.name for layer in decoded]
    if decoded_names != expected_names:
        fail(f"layer order/name mismatch: {decoded_names}")

    for layer, record in zip(decoded, handoff["layers"]):
        if not isinstance(layer, nested_layers.Image):
            fail(f"{record['name']}: decoded as a group")
        source_path = (ROOT / record["sourcePath"]).resolve()
        if sha256(source_path) != record["sourceSha256"]:
            fail(f"{record['name']}: source hash drift")
        source = np.asarray(Image.open(source_path).convert("RGBA"), dtype=np.uint8)
        decoded_rgba = np.dstack(
            [
                channel_array(layer, enums.ChannelId.red),
                channel_array(layer, enums.ChannelId.green),
                channel_array(layer, enums.ChannelId.blue),
                channel_array(layer, enums.ChannelId.transparency),
            ]
        )
        if decoded_rgba.shape != source.shape or not np.array_equal(decoded_rgba, source):
            fail(f"{record['name']}: RGBA round-trip mismatch")
        if [layer.left, layer.top] != record["origin"]:
            fail(f"{record['name']}: origin drift")

    print(
        f"layered PSD valid: {len(decoded)} exact RGBA layers, "
        f"{width}x{height}, hashes/order/origins pass"
    )


if __name__ == "__main__":
    main()
