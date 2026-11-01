# App Store: ficha es-ES de Manual SAMUR 1.0.0

Material para la ficha de lanzamiento (issue #101). Nada de esto se ha subido a App Store
Connect: la carga la hace el propietario después de revisarlo.

## Qué hay aquí

| Ruta | Contenido |
| --- | --- |
| `metadata/` | Ficha en formato fastlane, que `asc migrate validate/import --fastlane-dir apps/mobile/release/app-store` entiende. `es-ES/` lleva nombre, subtítulo, palabras clave, texto promocional, descripción, novedades y URLs; `review_information/notes.txt`, las notas para App Review; `primary_category.txt` / `secondary_category.txt`, Medicina y Consulta. |
| `raw/` | Capturas reales sin marco, de la build Release en el simulador, en español y en modo claro. |
| `framed/` | Capturas de marketing a tamaño exacto de App Store Connect (PNG sRGB sin alfa). Son las que se suben. |
| `iphone-duo/es/` | Capturas de iPhone Duo sin marco ni texto, como pide `release/screenshot-shot-list-es.md`. |
| `event/` | Medios y texto del evento integrado "Lanzamiento con APTA Academy". |
| `creative/` | Recursos creativos de iOS 27: cabecera de la ficha (3840 × 1646) y resultado de búsqueda (3840 × 2560). |
| `lynx/` | Poses del lince de APTA Academy (PNG con alfa) que usan las capturas 01-03, la cabecera, el resultado de búsqueda y el evento. Procedencia en `apps/mobile/assets/APTA_ASSET_PROVENANCE.md`. |
| `captions.json`, `tools/compose.py` | Textos de las capturas y el script que las compone. `tools/creative.py` genera la cabecera y el resultado de búsqueda; `tools/event.py`, los medios del evento. |

Regenerar: `python3 apps/mobile/release/app-store/tools/compose.py`,
`python3 apps/mobile/release/app-store/tools/creative.py` y
`python3 apps/mobile/release/app-store/tools/event.py` (Pillow y las fuentes SF Pro Display
instaladas en `/Library/Fonts`).

## Nombre y subtítulo

- **Nombre:** `Manual SAMUR: Guía no oficial` (29/30). "Manual SAMUR" es lo que la gente
  busca; "no oficial" va en el nombre porque es la primera línea que lee App Review y la que
  evita cualquier lectura de afiliación.
- **Subtítulo:** `Protocolos, fármacos y códigos` (30/30). Las tres cosas que se vienen a
  buscar, con las palabras con las que se buscan.
- **Categorías:** Medicina (principal), Consulta (secundaria).

Apple indexa nombre, subtítulo y palabras clave juntos, así que ninguna palabra de los dos
primeros se repite en el campo de palabras clave: `manual`, `samur`, `guía`, `oficial`,
`protocolos`, `fármacos`, `códigos` ya cuentan.

## Palabras clave

```
emergencias,urgencias,112,SVA,SVB,RCP,PCR,TES,vademecum,triaje,enfermeria,Madrid,soporte,vital,dosis
```

**100 caracteres, 100 bytes UTF-8** (todo ASCII). Validado con `asc migrate validate`.

Cambios sobre la lista de partida:

| Término | Decisión | Por qué |
| --- | --- | --- |
| `emergencias`, `urgencias`, `112` | Se quedan | Intención genérica más alta del sector; `112` es búsqueda real en España y cabe en 3 caracteres. |
| `SVA`, `SVB`, `RCP`, `TES` | Se quedan | Siglas que el público objetivo teclea tal cual; 3 caracteres cada una. |
| `PCR` | Se añade | "Parada cardiorrespiratoria" se busca por sus siglas y es el procedimiento estrella (301). Cuatro bytes con la coma. |
| `vademecum` | Se queda, sin tilde | La búsqueda de App Store ignora los diacríticos; sin tilde ahorra un byte. |
| `enfermería` → `enfermeria` | Sin tilde | Mismo motivo: 10 bytes en lugar de 11. |
| `triaje`, `Madrid` | Se quedan | `triaje` es búsqueda de oficio; `Madrid` capta la búsqueda local ("emergencias Madrid"). |
| `soporte vital` → `soporte,vital` | Partido | Apple combina palabras entre campos y dentro del campo; separadas cubren "soporte vital avanzado/básico" y combinan con `SVA`/`SVB` sin gastar el espacio. |
| `dosis` | Se añade | Es lo que se busca en el vademécum y lo que enseña la captura 3. |
| `sanitario` | Fuera | Genérico, poca intención y 10 bytes. |
| `hospitales` | Fuera | El mapa es una función secundaria; 11 bytes que rinden más en `PCR` + `dosis`. Si las búsquedas lo piden, es el primer candidato a volver. |

No se usan marcas de terceros (SUMMA, 061…), ni singulares y plurales a la vez, ni el
nombre de la categoría (Medicina), que Apple ya añade.

## Capturas: orden y textos

Los tres primeros puestos son los que se ven en los resultados de búsqueda, así que cada uno
vende la app por sí solo y muestra una ventaja distinta:

| # | Captura | Titular | Subtítulo |
| --- | --- | --- | --- |
| 1 | Buscar "adrenalina" | Todo el manual en una búsqueda | Procedimientos, fármacos y códigos al instante |
| 2 | Procedimiento 301 con su índice | Ve directo a la sección | Cada procedimiento con su índice, a un toque |
| 3 | Vademécum: adrenalina con dosis | Dosis claras, sin rodeos | Adultos y niños, vías y presentaciones |
| 4 | Códigos de incidente | Códigos de radio a mano | Incidente, SVB, SVA, UPSI, claves e indicativos |
| 5 | Mapa de hospitales y bases | Hospitales y bases en el mapa | Tu ubicación es opcional y no sale del iPhone |
| 6 | Ajustes: "Datos del 28 de octubre de 2026" | Funciona sin cobertura | Todo va en el iPhone y se actualiza cada mes |
| 7 | iPad, lista y procedimiento | En iPad, lista y ficha a la vez | Dos columnas para no perder el sitio |
| 8 | Apple Watch (código y fármaco) | Y en tu muñeca | Códigos, vademécum y Status 4 en el Apple Watch |

La serie de iPad sigue la misma historia con capturas de iPad (2 y 4 en dos columnas, 7 en
horizontal) y termina también en el Apple Watch.

Criterios:

- Titulares de 3 a 6 palabras, en beneficio y no en nombre de pantalla, con equilibrio de
  líneas para que no quede una palabra suelta. A tamaño de resultado de búsqueda (~1/4) el
  titular sigue en torno a 30 px de alto.
- Fondo azul de marca (`#1B4FA8` → `#133A7D`), texto blanco, captura real en un marco
  dibujado (no se usa imaginería de Apple ni nada oficial de SAMUR o del Ayuntamiento).
- Captura 1 con una búsqueda de fármaco: tras el arreglo de esta PR la tarjeta de
  Adrenalina sale arriba y debajo los procedimientos que la citan, que es exactamente la
  promesa del titular.
- Cada afirmación es verificable en la app: sin conexión (paquete local y última copia
  válida), actualización mensual (sincronización del día 1), ubicación solo en el
  dispositivo (`NSLocationWhenInUseUsageDescription`), Apple Watch con Códigos,
  Vademécum y Status 4.

### El lince en el trío de búsqueda (01-03)

Hasta iOS 26, y en iOS 27 si no se sube un recurso de resultado de búsqueda, la búsqueda
enseña las tres primeras capturas. Para que el trío se lea como una unidad y se reconozca a
tamaño miniatura:

- El lince de APTA Academy hace de guía recurrente: **señala** en 01 (búsqueda), da el
  **pulgar arriba** en 02 (procedimiento) y **saluda** en 03 (vademécum). Alterna derecha,
  izquierda, derecha, de modo que en la fila de resultados el ojo recorre las tres.
- Va **detrás** del dispositivo y asoma por el borde superior: solo se ven cabeza, hombros y
  gesto. Nunca tapa la interfaz, que sigue siendo la protagonista; tampoco sobresale por los
  lados del marco. Contorno crema para separarlo del fondo azul.
- Titular un 15 % más grande en iPhone (5 % en iPad) en las tres primeras, y más aire entre
  texto y dispositivo para dejar sitio al lince. Se mantiene el orden acordado y el texto.
- 04-08 no cambian: mismo fondo, tipografía y marco, así que la serie sigue siendo coherente
  y el lince queda como firma del primer pantallazo, no como ruido en todas.
- Todo sale de `captions.json` (campos `lynx`, `gap`, `headline_scale`) y `compose.py`.

## Cabecera y resultado de búsqueda (iOS 27)

Desde el 5 de octubre de 2026 App Store Connect acepta **recursos creativos** opcionales
para dos sitios nuevos de la tienda, que solo se ven en iOS 27 / iPadOS 27 o posterior. Se
suben en la página de versión, en *Product Page Information* → *Header and Search Results*,
o en *Asset Library* como envío independiente (sin nueva versión). Especificaciones de
Apple ("Creative assets specifications"):

| Sitio | Proporción | Tamaño | Archivo |
| --- | --- | --- | --- |
| Cabecera de la ficha | 21:9 | 3840 × 1646 | `creative/header-3840x1646.png` |
| Resultado de búsqueda | 3:2 | de 1920 × 1280 a 3840 × 2560 | `creative/search-results-3840x2560.png` |
| Universal (sirve para ambos) | 16:9 | 5244 × 2950, solo PNG | no se ha hecho |

Sin alfa, PNG sRGB. Las zonas seguras vienen de las plantillas de Apple según el análisis
de ObjectGraph (cabecera x 1097-2743, y 493-1154; búsqueda x 836-3004, y 765-1795): no se
han podido abrir las plantillas oficiales, así que hay que confirmarlas con *Preview* en App
Store Connect antes de enviar.

- **Cabecera:** sin texto. Apple pide "una sola idea clara" y debajo ya van el icono y el
  nombre. El lince saluda junto al iPhone con la búsqueda real; en los cortes anchos (iPad)
  aparecen además el iPad en horizontal y el Apple Watch. Fondo azul de marca con manchas de
  lince.
- **Resultado de búsqueda:** Apple pide "state the obvious" y enseñar la interfaz. Titular
  corto a la izquierda ("Todo el manual en una búsqueda", con "Protocolos, fármacos y
  códigos, sin red" debajo), iPhone con la búsqueda real a la derecha y el lince asomando
  detrás. Comprobado a 384 px de ancho, el tamaño aproximado en la búsqueda: el titular se lee.
- Si no se sube el recurso de búsqueda, App Store enseña el evento, los vídeos o las capturas
  (01-03), así que el trío sigue siendo necesario para iOS 26 y anteriores.
- Ninguno lleva precio, URL, logotipos ajenos ni nada oficial de SAMUR o del Ayuntamiento.

Fuentes: [Creative assets specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/creative-assets-specifications),
[Manage your App Store assets](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-your-app-store-assets/),
[App Store asset best practices](https://developer.apple.com/app-store/asset-best-practices/),
[ObjectGraph: zonas seguras](https://objectgraph.com/blog/ios-27-app-store-header-and-search-results-art/).

## Descripción, texto promocional y novedades

- **Descripción:** gancho de dos líneas (lo que hace y que funciona sin cobertura), bloques
  escaneables con viñetas por función, y el aviso de independencia al final, completo. No
  promete navegación, datos en tiempo real, capacidad hospitalaria ni que la app sea oficial.
- **Texto promocional (138/170):** pensado para el lanzamiento; se puede cambiar sin nueva
  versión. Después del estreno, rotarlo a la novedad del mes del manual.
- **Novedades:** lista corta de lo que trae la 1.0.0.

## URLs

| Campo | URL |
| --- | --- |
| Marketing | https://manualsamur.apta-academy.com |
| Soporte | https://manualsamur.apta-academy.com/soporte |
| Privacidad | https://manualsamur.apta-academy.com/privacidad |

`/soporte`, `/privacidad` y `/acerca-de` existen en `app/`. Desde esta red el dominio
`workers.dev` no siempre respondía (ver más abajo), así que conviene abrir las tres URLs
antes de enviar.

## Evento integrado

Ver `event/event-es-ES.md`: distintivo Estreno, nombre `Lanzamiento con APTA Academy`
(28/30), descripción breve (44/50) y larga (119/120), tarjeta 1920 × 1080 y detalle
1080 × 1920 sin texto, con el lince.

El evento es el estreno de la guía creada por APTA Academy y lleva al manual **dentro** de la
app. No anuncia los cursos de APTA ni enlaza a su web: la guía 2.3.13 exige que el evento
ocurra dentro de la app y que sus metadatos traten del evento, y la guía de eventos excluye
las promociones generales. Anunciar APTA como servicio externo sería un rechazo casi seguro;
el análisis de riesgo está en `event/event-es-ES.md`. Los medios ya no usan degradado: Apple
pide no añadir degradados ni bordes.

## Comprobaciones antes de subir

- `asc migrate validate --fastlane-dir apps/mobile/release/app-store`: VALIDATION PASSED.
- Todas las capturas: PNG, sin alfa, tamaño exacto (ver tabla de inventario en la PR).
- Abrir las URLs de soporte y privacidad desde una red que no bloquee `workers.dev`.
- Cabecera y resultado de búsqueda: revisar con *Preview* en App Store Connect (iPhone e
  iPad, ambas orientaciones) que el lince y el titular quedan dentro de la zona visible.
- Evento: comprobar en un iPhone con la app instalada que el enlace del evento abre el
  manual en la app y no Safari.
