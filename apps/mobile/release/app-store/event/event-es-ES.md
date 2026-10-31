# Evento integrado: lanzamiento (es-ES)

Se crea en App Store Connect después de que se apruebe la versión 1.0.0. Este archivo solo
recoge el texto y los medios; no se ha subido nada.

| Campo | Valor | Límite |
| --- | --- | ---: |
| Distintivo (badge) | Estreno (Premiere) | n/a |
| Nombre del evento | Manual SAMUR, ya disponible | 27 / 30 |
| Descripción breve | En iPhone, iPad y Apple Watch, también sin red | 46 / 50 |
| Descripción larga | Busca en todo el manual, consulta dosis y códigos de radio y lleva esta guía no oficial contigo, incluso sin cobertura. | 119 / 120 |
| Objetivo | Nuevos usuarios y usuarios existentes | |
| Prioridad | Normal | |
| Enlace (deep link) | Ninguno: el evento abre la app en Inicio | |

## Medios

Los dos sin texto: App Store dibuja el nombre, el distintivo y la descripción encima.
Los dispositivos quedan en la zona central; los bordes y la franja inferior solo llevan
el degradado de marca (`#1B4FA8` → `#133A7D`). Sin logotipos ni escudos oficiales: solo
el icono propio de la app y capturas reales.

| Uso | Archivo | Tamaño |
| --- | --- | --- |
| Tarjeta del evento (16:9) | `event-card-1920x1080.png` | 1920 × 1080 |
| Página de detalle (9:16) | `event-details-1080x1920.png` | 1080 × 1920 |

Se regeneran con `python3 apps/mobile/release/app-store/tools/event.py`.

## Fechas sugeridas

- Publicación del evento: el mismo día en que la 1.0.0 salga a la venta.
- Inicio: ese día. Fin: 14 días después. Un evento de estreno solo tiene sentido mientras la
  app es nueva; después conviene dejar paso a un evento de "Gran actualización" cuando haya una.
