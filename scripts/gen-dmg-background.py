#!/usr/bin/env python3
"""Generate Beaver's branded DMG installer background (1x + @2x)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src-tauri" / "dmg"
HEAD = ROOT / "public" / "beaver-head.webp"

W, H = 660, 420
BG = (26, 23, 20)       # #1a1714
FG = (231, 226, 218)    # #e7e2da
MUTED = (154, 143, 128)  # #9a8f80
AMBER = (224, 164, 90)
DIVIDER = (54, 48, 42)

FONT_CANDIDATES = [
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
    "/Library/Fonts/Arial.ttf",
]


def load_font(size: int, bold: bool = False):
    for path in FONT_CANDIDATES:
        try:
            idx = 1 if (bold and path.endswith(".ttc")) else 0
            return ImageFont.truetype(path, size, index=idx)
        except Exception:
            continue
    return ImageFont.load_default()


def render(scale: int) -> Image.Image:
    w, h = W * scale, H * scale
    img = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(img)

    head = Image.open(HEAD).convert("RGBA")
    hs = 40 * scale
    head = head.resize((hs, hs), Image.LANCZOS)
    img.paste(head, (40 * scale, 28 * scale), head)

    d.text((90 * scale, 34 * scale), "Beaver", font=load_font(24 * scale, bold=True), fill=FG)
    d.line([(40 * scale, 92 * scale), (w - 40 * scale, 92 * scale)], fill=DIVIDER, width=max(1, scale))

    ay = 210 * scale
    d.line([(250 * scale, ay), (408 * scale, ay)], fill=AMBER, width=3 * scale)
    d.polygon(
        [(408 * scale, ay - 8 * scale), (408 * scale, ay + 8 * scale), (426 * scale, ay)],
        fill=AMBER,
    )

    caption = "Drag Beaver into your Applications folder"
    font = load_font(14 * scale)
    tb = d.textbbox((0, 0), caption, font=font)
    d.text(((w - (tb[2] - tb[0])) // 2, 332 * scale), caption, font=font, fill=MUTED)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    render(1).save(OUT / "background.png")
    render(2).save(OUT / "background@2x.png")
    print(f"wrote {OUT/'background.png'} (660x420) and {OUT/'background@2x.png'} (1320x840)")


if __name__ == "__main__":
    main()
