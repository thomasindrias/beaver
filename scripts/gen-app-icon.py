#!/usr/bin/env python3
"""Build a 1024x1024 macOS app-icon source: beaver head on a warm squircle."""
import sys
from pathlib import Path
from PIL import Image, ImageDraw

SRC = Path.home() / "Downloads" / "beaver_head_transparent_app_icon.png"

SIZE = 1024
RADIUS = 229            # ~0.2237 * 1024, the macOS squircle corner radius
TOP = (251, 234, 203)   # warm cream
BOT = (224, 164, 90)    # amber


def gradient(size: int, top, bot) -> Image.Image:
    g = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / (size - 1)
        g.putpixel((0, y), tuple(round(top[i] * (1 - t) + bot[i] * t) for i in range(3)))
    return g.resize((size, size))


def rounded_mask(size: int, radius: int) -> Image.Image:
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def main(out_path: str) -> None:
    base = gradient(SIZE, TOP, BOT).convert("RGBA")
    base.putalpha(rounded_mask(SIZE, RADIUS))

    head = Image.open(SRC).convert("RGBA")
    head = head.crop(head.getbbox())
    target = int(SIZE * 0.62)
    ratio = target / max(head.size)
    head = head.resize((round(head.width * ratio), round(head.height * ratio)), Image.LANCZOS)
    x = (SIZE - head.width) // 2
    y = (SIZE - head.height) // 2 - int(SIZE * 0.02)
    base.alpha_composite(head, (x, y))

    base.save(out_path)
    print(f"wrote {out_path} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "/tmp/beaver-icon-source.png")
