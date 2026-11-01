"""Generate the In-App Event media for "Lanzamiento con APTA Academy" (no text).

    python3 apps/mobile/release/app-store/tools/event.py

Writes, under `event/`:
  - event-card-1920x1080.png     (event card, 16:9, Apple minimum size)
  - event-details-1080x1920.png  (event details page, 9:16, Apple minimum size)

Rules from Apple's In-App Events guidance (developer.apple.com/app-store/in-app-events):
  - no text or logos in the media: App Store draws the badge, name and description;
  - no borders or gradients: App Store applies its own crops and gradients, so the
    background is flat brand blue with the lynx-spot motif, not a gradient;
  - keep the subject central: the card is cropped at the sides (third-party guides
    report ~75 px a side) and App Store lays the copy over the bottom.

The APTA Academy lynx (cutouts in `lynx/`, provenance in
`apps/mobile/assets/APTA_ASSET_PROVENANCE.md`) is the subject; the devices show real
captures of the app, because the event is something the user does inside the app.
"""
from __future__ import annotations

import os
import sys
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compose import device, lynx_cutout, raw_path  # noqa: E402
from creative import glow, spotted_background  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def raw(path: str) -> Image.Image:
    return Image.open(raw_path(path))


def place(canvas: Image.Image, img: Image.Image, center: tuple[int, int]) -> None:
    canvas.alpha_composite(img, (center[0] - img.width // 2, center[1] - img.height // 2))


def card() -> Image.Image:
    W, H = 1920, 1080
    c = spotted_background((W, H), 3, (360, 0, 1560, round(H * 0.8)))
    glow(c, (W // 2, int(H * 0.42)), 470, alpha=60)
    # The lynx studying on its books, beside the phone open on a procedure:
    # the manual as a study companion, which is what the event is about.
    phone = device(raw("iphone-6.9/iphone-02-procedimiento.png"), 360, 0.115, 0.022)
    place(c, phone, (W // 2 + 210, int(H * 0.53)))
    lynx = lynx_cutout("study", 640)
    place(c, lynx, (W // 2 - 240, int(H * 0.40)))
    return c.convert("RGB")


def details() -> Image.Image:
    W, H = 1080, 1920
    c = spotted_background((W, H), 5, (80, 120, 1000, round(H * 0.66)))
    glow(c, (W // 2, int(H * 0.36)), 470, alpha=60)
    # Side by side, never overlapping: the lynx welcomes, the phone shows the search.
    phone = device(raw("iphone-6.9/iphone-01-buscar.png"), 390, 0.115, 0.022)
    place(c, phone, (W // 2 + 220, int(H * 0.38)))
    lynx = lynx_cutout("wave", 760)
    place(c, lynx, (W // 2 - 245, int(H * 0.42)))
    # Bottom third left calm: App Store lays the event copy over it.
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
