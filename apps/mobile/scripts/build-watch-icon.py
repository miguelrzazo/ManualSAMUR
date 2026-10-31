"""Derives the Apple Watch app icon from the iOS light icon.

watchOS masks app icons to a circle and rejects alpha. The iOS artwork has a
rounded-square bevel baked into its outer edge and an ambulance that reaches the
corners, so a plain crop either keeps the bevel or clips the vehicle. Instead:

1. centre-crop 896 px to drop the bevel,
2. scale that down to 800 px so the whole vehicle fits inside the watch circle,
3. paste it, with a feathered edge, onto a 1024 px canvas filled with the same
   vertical blue gradient sampled from the original,
4. save as opaque RGB.

The result is committed at targets/watch/watch-icon.png and consumed by
targets/watch/expo-target.config.js. Re-run when the iOS icon changes:

    python3 -I apps/mobile/scripts/build-watch-icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "icon-ios-light.png"
OUTPUT = ROOT / "targets" / "watch" / "watch-icon.png"

SIZE = 1024
CROP = 896
INNER = 800

source = Image.open(SOURCE).convert("RGB")
offset = (SIZE - CROP) // 2
crop = source.crop((offset, offset, offset + CROP, offset + CROP))

# Background: vertical gradient between the plain-blue areas above the beacon and
# below the wheels of the original artwork.
top = source.getpixel((512, 110))
bottom = source.getpixel((512, 930))
canvas = Image.new("RGB", (SIZE, SIZE))
draw = ImageDraw.Draw(canvas)
for y in range(SIZE):
    t = y / (SIZE - 1)
    draw.line([(0, y), (SIZE, y)], fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)))

inner = crop.resize((INNER, INNER), Image.LANCZOS)
mask = Image.new("L", (INNER, INNER), 0)
ImageDraw.Draw(mask).rounded_rectangle((24, 24, INNER - 24, INNER - 24), radius=160, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(20))
pos = (SIZE - INNER) // 2
canvas.paste(inner, (pos, pos), mask)

canvas.save(OUTPUT, "PNG")
print(f"wrote {OUTPUT.relative_to(ROOT)} ({canvas.size[0]}x{canvas.size[1]}, {canvas.mode})")
