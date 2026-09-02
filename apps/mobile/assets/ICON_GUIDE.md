# ManualSAMUR mark export guidance

The master mark is the red/white geometric cross with a navy directional wedge. It is
kept as SVG so exports remain deterministic and sharp.

| Surface | Variant | Guidance |
| --- | --- | --- |
| iOS/Android launcher | `icon.png` | Use the red rounded-square export; keep the mark inside a 16% safe margin. |
| Android adaptive icon | `adaptive-icon-foreground.png` | Keep the foreground transparent and centered; Android supplies the red background/mask. |
| Splash | `splash.png` | Use the white mark on the red background; preserve generous empty space. |
| Web/PWA/favicon | `mark-white-on-red.svg` or `icon.png` | Prefer SVG for the favicon; use the PNG where the platform forbids SVG. |
| Header/map marker | `icon.svg` | Use the full-color mark at 24 px or larger. |
| Notifications/accessibility | `mark-monochrome-white.svg` or `mark-monochrome-black.svg` | Do not rely on color to convey meaning. |

Validate exports at 16 px, 24 px, launcher size, both OS masks, light/dark backgrounds,
and with a high-contrast or monochrome rendering before store submission.
