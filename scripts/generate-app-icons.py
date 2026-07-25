#!/usr/bin/env python3
"""Regenerate Android launcher icons — blue fill, no transparent/white corners."""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Final-Logo" / "asan-pay-appicon.png"
RES = ROOT / "apps" / "mobile" / "android" / "app" / "src" / "main" / "res"
BG = (11, 42, 154, 255)  # #0B2A9A

SIZES = {
    "mipmap-mdpi": 48,
    "mipmap-hdpi": 72,
    "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144,
    "mipmap-xxxhdpi": 192,
}


def flatten(src: Image.Image) -> Image.Image:
    rgba = src.convert("RGBA")
    flat = Image.new("RGBA", rgba.size, BG)
    flat.paste(rgba, (0, 0), rgba)
    # Scale artwork to full canvas — no inner margin / white halo on launchers
    bbox = flat.getbbox()
    if not bbox:
        return flat
    cropped = flat.crop(bbox)
    full = Image.new("RGBA", rgba.size, BG)
    scaled = cropped.resize(rgba.size, Image.Resampling.LANCZOS)
    full.paste(scaled, (0, 0), scaled)
    return full


def main() -> None:
    fg = Image.open(SRC)
    flat = flatten(fg)
    flat_path = ROOT / "Final-Logo" / "asan-pay-appicon-flat.png"
    flat.save(flat_path)
    flat.save(SRC)

    for folder, size in SIZES.items():
        icon = flat.resize((size, size), Image.Resampling.LANCZOS)
        out = RES / folder
        out.mkdir(parents=True, exist_ok=True)
        for name in ("ic_launcher.png", "ic_launcher_round.png", "ic_launcher_foreground.png"):
            icon.save(out / name)

    print(f"App icons updated from {SRC.name}")


if __name__ == "__main__":
    main()
