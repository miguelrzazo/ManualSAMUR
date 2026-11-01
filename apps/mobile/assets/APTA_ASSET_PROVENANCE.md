# Assets de APTA Academy

La mascota azul `apta-blue-tutor.png` es una variación generada con `illo`,
condicionada por `brand-kit/mascot/studying.png`, y después pasada a alpha para
usarla como cutout local.

La licencia del kit indica que la identidad APTA, sus logotipos y el personaje
son activos del proyecto y no tienen licencia pública de reutilización. Este uso
corresponde al anuncio acordado para Manual SAMUR; no se presenta como una
relación oficial con SAMUR-Protección Civil.

## Poses para la ficha de App Store (noviembre de 2026)

Cinco poses nuevas del mismo lince, para las capturas 01-03, la cabecera y el
resultado de búsqueda de iOS 27 y los medios del evento integrado. Viven en
`apps/mobile/release/app-store/lynx/` (no se empaquetan en la app):

| Archivo | Pose | Tamaño |
| --- | --- | --- |
| `apta-lynx-point.png` | De 3/4 hacia la izquierda, señalando arriba | 713 × 1207 |
| `apta-lynx-thumbs.png` | De 3/4 hacia la derecha, pulgar arriba | 621 × 1188 |
| `apta-lynx-phone.png` | De frente, con un teléfono en blanco en las manos | 555 × 1204 |
| `apta-lynx-wave.png` | De frente, saludando | 667 × 1202 |
| `apta-lynx-study.png` | Sentado sobre libros, con un libro abierto | 729 × 1214 |

Cómo se hicieron:

- `illo` en modo cutout (backend Codex, gpt-image-2), con `apta-blue-tutor.png`
  aplanado sobre blanco como **única** referencia, para conservar manchas, colores
  (`#1E5ABF`, `#0A2048`, `#F9F1DF`), proporciones y trazo. Sin texto ni logotipos.
- Fondo verde `#00FF00` recortado a alpha con un script de Pillow (umbral sobre el
  exceso de verde, eliminación del halo verde y recorte al contorno), porque el
  recorte automático de `illo` no lo extrajo.
- Ningún material de SAMUR-Protección Civil ni del Ayuntamiento de Madrid.

Mismo régimen que la mascota original: activo del proyecto APTA, autorizado para
esta promoción acordada dentro de Manual SAMUR, sin licencia pública de reutilización.
