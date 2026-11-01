"""Compose the App Store marketing frames from the raw captures.

    python3 apps/mobile/release/app-store/tools/compose.py

Reads `captions.json` and the PNGs under `raw/`, writes flattened sRGB PNGs (no alpha)
at the exact App Store Connect sizes under `framed/`. Needs Pillow and the SF Pro
Display fonts in /Library/Fonts (installed with Apple's SF Pro package).

Frames with a `lynx` entry in `captions.json` get the APTA Academy lynx (cutouts in
`lynx/`, provenance in `apps/mobile/assets/APTA_ASSET_PROVENANCE.md`) peeking over the top
edge of the device. It is drawn behind the device, so it never covers app UI.

The device outline is drawn here (a plain rounded bezel), not taken from Apple's
product imagery, and no official SAMUR or Ayuntamiento artwork is used anywhere.
"""
from __future__ import annotations

import json
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FONT_DIR = "/Library/Fonts"

BLUE = (27, 79, 168)          # #1B4FA8 primary
BLUE_DARK = (19, 58, 125)     # #133A7D primaryDark
INK = (19, 35, 61)            # #13233D
WASH = (231, 238, 250)        # #E7EEFA primaryWash
WHITE = (255, 255, 255)
BEZEL = (14, 22, 38)          # #0E1626 dark paper
CREAM = (249, 241, 223)       # #F9F1DF APTA lynx cream


def raw_path(path: str) -> str:
    """Raw captures live in `raw/`; the Apple Watch set is reused from
    `release/screenshots/watch/` (captured with the watch app, see #119)."""
    if path.startswith("watch/"):
        return os.path.join(os.path.dirname(ROOT), "screenshots", path)
    return os.path.join(ROOT, "raw", path)


def font(weight: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(FONT_DIR, f"SF-Pro-Display-{weight}.otf"), size)


def gradient(size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]) -> Image.Image:
    w, h = size
    base = Image.new("RGB", (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        base.putpixel((0, y), tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3)))
    return base.resize((w, h))


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius=radius, fill=255)
    return mask


def wrap(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Greedy wrap, then rebalance: a headline reads better as two even lines than
    as a full line followed by an orphaned word ("Dosis claras, sin / rodeos")."""
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split(" ")
        greedy: list[str] = []
        line = ""
        for word in words:
            trial = f"{line} {word}".strip()
            if draw.textlength(trial, font=fnt) <= max_width or not line:
                line = trial
            else:
                greedy.append(line)
                line = word
        greedy.append(line)
        if len(greedy) == 2:
            best = None
            for i in range(1, len(words)):
                a, b = " ".join(words[:i]), " ".join(words[i:])
                wa, wb = draw.textlength(a, font=fnt), draw.textlength(b, font=fnt)
                if max(wa, wb) <= max_width and (best is None or max(wa, wb) < best[0]):
                    best = (max(wa, wb), [a, b])
            if best:
                greedy = best[1]
        lines.extend(greedy)
    return lines


def draw_text_block(canvas: Image.Image, top: int, headline: str, subline: str, scale: float, width_ratio: float = 0.86, headline_scale: float = 1.0) -> int:
    """Centered headline + subline. Returns the y just below the block."""
    draw = ImageDraw.Draw(canvas)
    w = canvas.width
    max_w = int(w * width_ratio)
    h_font = font("Heavy", int(118 * scale * headline_scale))
    s_font = font("Medium", int(54 * scale * headline_scale ** 0.5))
    y = top
    for line in wrap(draw, headline, h_font, max_w):
        tw = draw.textlength(line, font=h_font)
        draw.text(((w - tw) / 2, y), line, font=h_font, fill=WHITE)
        y += int(h_font.size * 1.08)
    y += int(26 * scale)
    for line in wrap(draw, subline, s_font, max_w):
        tw = draw.textlength(line, font=s_font)
        draw.text(((w - tw) / 2, y), line, font=s_font, fill=(214, 226, 247))
        y += int(s_font.size * 1.3)
    return y


def device(shot: Image.Image, width: int, corner_ratio: float, bezel_ratio: float) -> Image.Image:
    """A screenshot inside a plain rounded bezel, with a soft shadow, on transparent."""
    scale = width / shot.width
    screen = shot.convert("RGB").resize((width, round(shot.height * scale)), Image.LANCZOS)
    bezel = max(6, round(width * bezel_ratio))
    radius = round(width * corner_ratio)
    outer = (screen.width + 2 * bezel, screen.height + 2 * bezel)
    pad = bezel * 4
    out = Image.new("RGBA", (outer[0] + 2 * pad, outer[1] + 2 * pad), (0, 0, 0, 0))
    shadow = Image.new("RGBA", out.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([pad, pad + bezel, pad + outer[0], pad + outer[1] + bezel], radius=radius + bezel, fill=(5, 15, 40, 120))
    out = Image.alpha_composite(out, shadow.filter(ImageFilter.GaussianBlur(bezel * 1.6)))
    frame = Image.new("RGBA", outer, (0, 0, 0, 0))
    ImageDraw.Draw(frame).rounded_rectangle([0, 0, outer[0] - 1, outer[1] - 1], radius=radius + bezel, fill=BEZEL + (255,))
    frame.paste(screen, (bezel, bezel), rounded_mask(screen.size, radius))
    out.alpha_composite(frame, (pad, pad))
    return out


def lynx_cutout(pose: str, height: int, flip: bool = False) -> Image.Image:
    """An APTA lynx pose from `lynx/`, scaled to `height`, with a cream sticker outline
    so the blue fur separates from the blue background (see APTA_ASSET_PROVENANCE.md)."""
    src = Image.open(os.path.join(ROOT, "lynx", f"apta-lynx-{pose}.png")).convert("RGBA")
    if flip:
        src = src.transpose(Image.FLIP_LEFT_RIGHT)
    img = src.resize((round(src.width * height / src.height), height), Image.LANCZOS)
    stroke = max(4, round(height * 0.009))
    pad = stroke * 3
    out = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), (0, 0, 0, 0))
    alpha = Image.new("L", out.size, 0)
    alpha.paste(img.getchannel("A"), (pad, pad))
    ring = alpha.point(lambda v: 255 if v > 40 else 0).filter(ImageFilter.MaxFilter(stroke * 2 + 1)).filter(ImageFilter.GaussianBlur(1))
    shadow = ring.filter(ImageFilter.GaussianBlur(stroke * 2)).point(lambda v: v * 90 // 255)
    out.paste(Image.new("RGBA", out.size, (5, 15, 40, 255)), (0, round(stroke * 1.5)), shadow)
    out.alpha_composite(Image.composite(Image.new("RGBA", out.size, CREAM + (255,)), Image.new("RGBA", out.size, (0, 0, 0, 0)), ring))
    out.alpha_composite(img, (pad, pad))
    return out


def place_lynx(canvas: Image.Image, spec: dict, device_top: int) -> None:
    """Peek over the top edge of the device: `overlap` of the lynx height sits behind it."""
    W, H = canvas.size
    lynx = lynx_cutout(spec["pose"], round(H * spec["height"]), spec.get("flip", False))
    x = round(W * spec["x"]) - lynx.width // 2
    y = device_top - round(lynx.height * (1 - spec.get("overlap", 0.45)))
    canvas.alpha_composite(lynx, (x, y))


def compose(spec: dict, item: dict, out_path: str) -> None:
    W, H = spec["size"]
    scale = W / 1320 if W < H else H / 1320
    scale *= spec.get("text_scale", 1.0)
    canvas = gradient((W, H), BLUE, BLUE_DARK).convert("RGBA")
    top = round(H * spec.get("text_top", 0.045))
    below = draw_text_block(canvas, top, item["headline"], item["subline"], scale, headline_scale=item.get("headline_scale", 1.0))
    gap = round(H * item.get("gap", 0.025))
    shots = item["raw"] if isinstance(item["raw"], list) else [item["raw"]]
    images = [Image.open(raw_path(p)) for p in shots]
    layout = item.get("layout", "single")
    if layout == "single":
        shot = images[0]
        landscape = shot.width > shot.height
        ratio = item.get("width_ratio", spec["device_width"] if not landscape else 0.94)
        d = device(shot, round(W * ratio), item.get("corner", spec["corner"]), spec["bezel"])
        x = (W - d.width) // 2
        y = below + gap - round(d.width * 0.02)
        if landscape:
            # A landscape iPad shot: centre it in the space left under the text.
            y = below + max(gap, (H - below - d.height) // 2)
        if "lynx" in item:
            # Behind the device: only the head, shoulders and gesture show above its edge,
            # so the lynx never covers the app UI. `pad` is the device image's shadow margin.
            pad = (d.width - round(W * ratio)) // 2
            place_lynx(canvas, item["lynx"], y + pad)
        canvas.alpha_composite(d, (x, y))
    elif layout == "watches":
        # Two Apple Watch faces, large and overlapping on a diagonal.
        size = round(min(W * 0.56, H * 0.30))
        first = device(images[0], size, 0.30, 0.07)
        second = device(images[1], size, 0.30, 0.07)
        y0 = below + gap
        # Shadow padding is part of each image; keep the visible watch inside the canvas.
        pad = (first.width - size) // 2
        step = min(round(first.height * 0.60), H - y0 - first.height + pad // 2)
        x1 = max(-pad // 2, round(W * 0.47) - first.width // 2 - round(size * 0.26))
        x2 = min(W - second.width + pad // 2, round(W * 0.53) - second.width // 2 + round(size * 0.26))
        canvas.alpha_composite(first, (x1, y0))
        canvas.alpha_composite(second, (x2, y0 + step))
    canvas = canvas.convert("RGB")
    assert canvas.size == (W, H), (canvas.size, (W, H))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.save(out_path, "PNG", optimize=True)
    print(f"{out_path}  {W}x{H}")


def main() -> None:
    config = json.load(open(os.path.join(ROOT, "captions.json"), encoding="utf-8"))
    only = set(sys.argv[1:])
    for set_name, spec in config["sets"].items():
        if only and set_name not in only:
            continue
        for index, item in enumerate(spec["shots"], start=1):
            name = f"{index:02d}-{item['id']}.png"
            compose(spec, item, os.path.join(ROOT, "framed", set_name, name))


if __name__ == "__main__":
    main()
