"""Compose the iOS 27 App Store creative assets: product page header and search results.

    python3 apps/mobile/release/app-store/tools/creative.py

Writes, under `creative/`, flattened sRGB PNGs (no alpha) at Apple's sizes
(App Store Connect Help > Creative assets specifications):

  - header-3840x1646.png          product page header, 21:9
  - search-results-3840x2560.png  search results, 3:2 (max size; min is 1920x1280)

Safe areas come from Apple's templates as reported in the ObjectGraph write-up (header
x 1097-2743, y 493-1154; search results x 836-3004, y 765-1795). Everything that has to
read (the lynx's face, the phone's search bar, the headline) sits inside them; the outer
band only carries background and the parts of the devices that may be cropped.

The header has no text: Apple asks for a single clear idea, and the app name and icon are
drawn right under it. The search results asset carries one short Spanish headline,
because it has to "state the obvious" at roughly a tenth of its pixel width.

Lynx: APTA Academy's mascot, see `apps/mobile/assets/APTA_ASSET_PROVENANCE.md`.
No SAMUR-Protección Civil or Ayuntamiento de Madrid artwork is used.
"""
from __future__ import annotations

import os
import random
import sys
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose import BLUE, BLUE_DARK, WHITE, device, font, lynx_cutout, raw_path  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPOT = (22, 66, 148)          # navy spot, a small step darker than the background
DEBUG = "--safe" in sys.argv  # draw the safe area for review


def spotted_background(size: tuple[int, int], seed: int, keep_clear: tuple[int, int, int, int]) -> Image.Image:
    """Flat brand blue with a scatter of soft navy spots, the lynx's coat as a motif.
    Spots avoid `keep_clear` (the safe area) so the subject stays calm."""
    W, H = size
    c = Image.new("RGBA", size, BLUE + (255,))
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    rnd = random.Random(seed)
    x0, y0, x1, y1 = keep_clear
    placed = 0
    while placed < 30:
        r = rnd.randint(round(min(W, H) * 0.012), round(min(W, H) * 0.032))
        x, y = rnd.randint(-r, W + r), rnd.randint(-r, H + r)
        if x0 - r < x < x1 + r and y0 - r < y < y1 + r:
            continue
        rx = round(r * rnd.uniform(0.8, 1.2))
        d.ellipse([x - rx, y - r, x + rx, y + r], fill=SPOT + (255,))
        placed += 1
    c.alpha_composite(layer.filter(ImageFilter.GaussianBlur(2)))
    return c


def glow(canvas: Image.Image, center: tuple[int, int], radius: int, alpha: int = 70) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    cx, cy = center
    ImageDraw.Draw(layer).ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=(143, 182, 245, alpha))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(radius // 2)))


def safe(canvas: Image.Image, box: tuple[int, int, int, int]) -> None:
    if DEBUG:
        ImageDraw.Draw(canvas).rectangle(box, outline=(255, 80, 80, 255), width=6)


def header() -> Image.Image:
    W, H = 3840, 1646
    box = (1097, 493, 2743, 1154)
    c = spotted_background((W, H), 7, (box[0] - 200, 0, box[2] + 200, H))
    glow(c, (W // 2, H // 2), 900)
    # The phone: real search screen, its search bar inside the safe area.
    phone = device(Image.open(raw_path("iphone-6.9/iphone-01-buscar.png")), 760, 0.115, 0.022)
    pad = (phone.width - 760) // 2
    c.alpha_composite(phone, (2230 - phone.width // 2, 250 - pad))
    # The lynx waving hello beside the phone (never over it), its face in the safe area.
    lynx = lynx_cutout("wave", 1130)
    c.alpha_composite(lynx, (1460 - lynx.width // 2, 360))
    # iPad on the far left and Apple Watch on the far right: only seen on wide crops.
    ipad = device(Image.open(raw_path("ipad-13/ipad-07-landscape.png")), 1250, 0.035, 0.016)
    c.alpha_composite(ipad, (-330, 520))
    watch = device(Image.open(raw_path("watch/46mm-03-codigo-detalle.png")), 420, 0.30, 0.07)
    c.alpha_composite(watch, (W - watch.width + 30, 560))
    safe(c, box)
    return c.convert("RGB")


def search_results() -> Image.Image:
    W, H = 3840, 2560
    box = (836, 765, 3004, 1795)
    c = spotted_background((W, H), 11, (box[0] - 160, box[1] - 260, box[2] + 160, box[3] + 160))
    glow(c, (2450, 1300), 900)
    d = ImageDraw.Draw(c)
    # Headline at the top-left of the safe area, legible at ~384 px wide.
    hf = font("Heavy", 146)
    sf = font("Semibold", 84)
    y = box[1] + 10
    for line in ("Todo el manual", "en una", "búsqueda"):
        d.text((box[0], y), line, font=hf, fill=WHITE)
        y += 160
    y += 40
    for line in ("Protocolos, fármacos", "y códigos, sin red"):
        d.text((box[0], y), line, font=sf, fill=(214, 226, 247))
        y += 104
    # Phone with the real search screen, right half of the safe area.
    phone = device(Image.open(raw_path("iphone-6.9/iphone-01-buscar.png")), 760, 0.115, 0.022)
    pad = (phone.width - 760) // 2
    px = 2380
    # The lynx stands behind the phone's right edge, pointing at the search bar.
    lynx = lynx_cutout("point", 1060)
    c.alpha_composite(lynx, (2900 - lynx.width // 2, 900))
    c.alpha_composite(phone, (px - phone.width // 2, box[1] - 60 - pad))
    safe(c, box)
    return c.convert("RGB")


def main() -> None:
    out = os.path.join(ROOT, "creative")
    os.makedirs(out, exist_ok=True)
    for name, img in (("header-3840x1646.png", header()), ("search-results-3840x2560.png", search_results())):
        path = os.path.join(out, name if not DEBUG else name.replace(".png", "-safe.png"))
        img.save(path, "PNG", optimize=True)
        print(path, img.size)


if __name__ == "__main__":
    main()
