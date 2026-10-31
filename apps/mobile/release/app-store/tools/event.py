"""Generate the In-App Event media (no text) from the raw captures.

    python3 apps/mobile/release/app-store/tools/event.py

Writes, under `event/`:
  - event-card-1920x1080.png     (event card, 16:9 landscape)
  - event-details-1080x1920.png  (event details page, 9:16 portrait)

App Store Connect draws the event name, badge and short description over the media,
so the images carry no text. Devices and the app icon sit inside the central safe
area; the outer edges and the bottom band (where App Store overlays copy) hold only
the brand gradient.
"""
from __future__ import annotations

import os
import sys
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose import BLUE, BLUE_DARK, device, gradient, raw_path  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MOBILE = os.path.dirname(os.path.dirname(ROOT))


def raw(path: str) -> Image.Image:
    return Image.open(raw_path(path))


def icon(size: int) -> Image.Image:
    src = Image.open(os.path.join(MOBILE, "assets", "icon-ios-light.png")).convert("RGBA").resize((size, size), Image.LANCZOS)
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size - 1, size - 1], radius=round(size * 0.225), fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(src, (0, 0), mask)
    pad = size // 4
    framed = Image.new("RGBA", (size + 2 * pad, size + 2 * pad), (0, 0, 0, 0))
    shadow = Image.new("RGBA", framed.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle([pad, pad + size // 30, pad + size, pad + size + size // 30], radius=round(size * 0.225), fill=(5, 15, 40, 130))
    framed = Image.alpha_composite(framed, shadow.filter(ImageFilter.GaussianBlur(size // 14)))
    framed.alpha_composite(out, (pad, pad))
    return framed


def glow(canvas: Image.Image, center: tuple[int, int], radius: int) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    cx, cy = center
    ImageDraw.Draw(layer).ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(143, 182, 245, 90))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius // 2)))


def place(canvas: Image.Image, img: Image.Image, center: tuple[int, int]) -> None:
    canvas.alpha_composite(img, (center[0] - img.width // 2, center[1] - img.height // 2))


def card() -> Image.Image:
    W, H = 1920, 1080
    c = gradient((W, H), BLUE, BLUE_DARK).convert("RGBA")
    glow(c, (W // 2, int(H * 0.42)), 520)
    ipad = device(raw("ipad-13/ipad-07-landscape.png"), 900, 0.035, 0.016)
    phone = device(raw("iphone-6.9/iphone-01-buscar.png"), 330, 0.115, 0.022)
    watch = device(raw("watch/46mm-05-vademecum-detalle.png"), 230, 0.30, 0.07)
    place(c, ipad, (W // 2 + 40, int(H * 0.44)))
    place(c, phone, (W // 2 - 440, int(H * 0.50)))
    place(c, watch, (W // 2 + 520, int(H * 0.56)))
    # No icon here: App Store already shows the app icon on the event card.
    return c.convert("RGB")


def details() -> Image.Image:
    W, H = 1080, 1920
    c = gradient((W, H), BLUE, BLUE_DARK).convert("RGBA")
    glow(c, (W // 2, int(H * 0.40)), 480)
    phone = device(raw("iphone-6.9/iphone-03-vademecum.png"), 520, 0.115, 0.022)
    watch = device(raw("watch/46mm-03-codigo-detalle.png"), 300, 0.30, 0.07)
    place(c, icon(150), (W // 2, int(H * 0.085)))
    place(c, phone, (W // 2 - 70, int(H * 0.47)))
    place(c, watch, (W // 2 + 250, int(H * 0.58)))
    # Bottom third stays quiet: App Store lays the event copy over it.
    fade = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(fade)
    for y in range(int(H * 0.62), H):
        t = (y - H * 0.62) / (H * 0.38)
        d.line([(0, y), (W, y)], fill=BLUE_DARK + (round(255 * min(1.0, t * 1.4)),))
    c.alpha_composite(fade)
    return c.convert("RGB")


def main() -> None:
    out = os.path.join(ROOT, "event")
    os.makedirs(out, exist_ok=True)
    for name, img in (("event-card-1920x1080.png", card()), ("event-details-1080x1920.png", details())):
        path = os.path.join(out, name)
        img.save(path, "PNG", optimize=True)
        print(path, img.size)


if __name__ == "__main__":
    main()
