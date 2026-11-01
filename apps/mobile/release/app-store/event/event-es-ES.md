# Evento integrado: Lanzamiento con APTA Academy (es-ES)

Se crea en App Store Connect cuando la 1.0.0 esté aprobada y a la venta. Este archivo solo
recoge el texto y los medios; no se ha subido nada.

## Qué es el evento (y qué no es)

El evento es **el estreno de Manual SAMUR, la guía creada por APTA Academy**, y lo que se
hace durante el evento ocurre dentro de la app: buscar en el manual, abrir procedimientos,
consultar dosis y códigos. APTA Academy aparece como autora (igual que en la app: "Esta
aplicación está creada por APTA Academy") y su lince es la cara del evento.

**No** es un anuncio de los cursos, tests o tutor de APTA Academy. Esas funciones viven en
`apta-academy.com`, fuera de la app, y la app solo enlaza a ellas desde la promo de primer
arranque y la tarjeta de Ajustes. Por eso el texto del evento no las menciona y el enlace del
evento no va a la web de APTA. Ver "Riesgo de revisión" abajo.

| Campo | Valor | Límite |
| --- | --- | ---: |
| Distintivo (badge) | Estreno (Premiere) | n/a |
| Nombre del evento | Lanzamiento con APTA Academy | 28 / 30 |
| Descripción breve | Protocolos, dosis y códigos, también sin red | 44 / 50 |
| Descripción larga | Estrena la guía no oficial creada por APTA Academy: busca protocolos, consulta dosis y repasa códigos, también sin red. | 119 / 120 |
| Objetivo (purpose) | Atraer nuevos usuarios | |
| Prioridad | Alta (es el único evento; no compite con otro) | |
| Coste | Ninguno: no requiere compra | |
| Enlace (deep link) | `https://manualsamur.miguelrzazo13.workers.dev/manual` (enlace universal ya declarado en `UNIVERSAL_LINK_PATHS`; abre el índice del manual dentro de la app) | |

Alternativa de nombre si App Review pide algo más distintivo y menos genérico:
`Estudia el manual con el lince` (30/30).

## Fechas sugeridas

Apple permite eventos de hasta 31 días y promocionarlos hasta 14 días antes del inicio.

- **Inicio:** el día en que la 1.0.0 salga a la venta (p. ej., si sale el lunes 16 de
  noviembre de 2026, inicio ese día a las 09:00, hora de Madrid).
- **Fin:** 14 días después (en el ejemplo, domingo 29 de noviembre de 2026, 23:59). Un
  estreno solo tiene sentido mientras la app es nueva.
- **Publicación en App Store:** a la vez que el inicio. La app no existe en la tienda antes
  de su aprobación, así que no hay ventana de "próximamente".
- Después, dejar paso a un evento de "Gran actualización" cuando haya una de verdad.

## Medios

Sin texto ni logotipos: App Store dibuja el distintivo, el nombre y la descripción encima.
Fondo **plano** azul de marca (`#1B4FA8`) con manchas de lince: la guía de Apple pide no
añadir degradados ni bordes porque App Store aplica los suyos (la versión anterior usaba
degradado; ya no). El lince y el teléfono quedan en el centro y por encima de la franja
inferior, donde App Store pone el texto. Sin logotipos ni escudos oficiales.

| Uso | Archivo | Tamaño | Contenido |
| --- | --- | --- | --- |
| Tarjeta del evento (16:9) | `event-card-1920x1080.png` | 1920 × 1080 | El lince estudiando sobre sus libros junto al iPhone con el procedimiento 301 |
| Página de detalle (9:16) | `event-details-1080x1920.png` | 1080 × 1920 | El lince saludando junto al iPhone con la búsqueda "adrenalina" |

Ambos tamaños son el mínimo de Apple (máximo 3840 × 2160 y 2160 × 3840). Se regeneran con
`python3 apps/mobile/release/app-store/tools/event.py`.

## Riesgo de revisión

Fuentes: guía 2.3.13 de las App Store Review Guidelines y
[In-App Events](https://developer.apple.com/app-store/in-app-events/).

- 2.3.13: los eventos son "timely events that happen within your app", los metadatos deben
  referirse al evento y no a la app en general, y el enlace del evento debe llevar al destino
  correcto **dentro de la app**.
- La guía de eventos excluye "general promotions that raise awareness about your app" y pide
  no usar la descripción "to promote your app or services".

| Planteamiento | Riesgo | Por qué |
| --- | --- | --- |
| Evento que anuncia los cursos, tests o tutor de APTA Academy, con enlace a `apta-academy.com` | **Alto: rechazo casi seguro** | Promociona un servicio externo; nada de eso ocurre dentro de la app; el enlace sale de la app. |
| Evento "Lanzamiento con APTA Academy" sobre el estreno de la guía, con enlace al manual dentro de la app (lo que propone este archivo) | **Medio-bajo** | Lo que se hace es usar la app. El punto débil es que un estreno de la propia app puede leerse como "promoción general". Si App Review lo rechaza, no afecta a la versión: los eventos se revisan por separado. |
| Evento ligado a una función de estudio nueva dentro de la app (p. ej., un repaso guiado de procedimientos con el lince) | Bajo | Sería el encaje más claro como "Major Update" o "Special Event" (colaboración), pero esa función no existe hoy. |

Lo más seguro, si se quiere que APTA Academy sea protagonista: construir primero algo de
APTA **dentro** de la app (aunque sea un repaso de procedimientos con el lince) y lanzar
entonces un evento "Special Event" sobre eso.
