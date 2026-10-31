# API pública de datos (móvil, Watch y terceros)

Origen de producción: `https://manualsamur.miguelrzazo13.workers.dev`

Todo lo que sirve esta API procede de la **publicación activa** en D1: el contenido
revisado y publicado desde la gestión editorial. Nunca incluye borradores, notas
privadas, referencias de trabajo ni identidades de quien edita. No requiere cuenta
ni clave. Es de solo lectura (`GET`, `HEAD`, `OPTIONS`).

## Cómo refrescar (recomendado)

1. `GET /api/public/manifest` con `If-None-Match: "<contentHash guardado>"`.
2. `304 Not Modified` → no hay nada nuevo. Fin.
3. `200` → compara `datasets[nombre].sha256` con el que guardaste y descarga solo
   los conjuntos que han cambiado (`url`), también con `If-None-Match: "<sha256>"`.
4. Verifica el SHA-256 de los bytes recibidos contra el manifiesto antes de
   sustituir la copia local (sustitución atómica; conserva la anterior si falla).

Para fijar una versión exacta (descargas largas, varios ficheros coherentes) usa
`immutableUrl`: está anclada a `releaseId` y no cambia nunca.

## Endpoints

| Ruta | Contenido | Caché / validador |
| --- | --- | --- |
| `GET /api/public/manifest` (alias `/api/public/manifest.json`) | Manifiesto de la publicación activa | `ETag: "<contentHash>"`, `no-cache` (revalidar) |
| `GET /api/public/datasets/{nombre}.json` | Conjunto actual | `ETag: "<sha256>"`, revalidar |
| `GET /api/public/releases/{releaseId}/datasets/{nombre}.json` | Conjunto de una publicación concreta | inmutable (1 año) |
| `GET /api/public/content` (alias `/api/mobile/content/v3`) | Snapshot completo `samur-manual.mobile-content` v3 | `ETag: "<contentHash>"` |
| `GET /api/public/releases/{releaseId}/snapshot` | Snapshot de una publicación concreta | inmutable |
| `GET /api/mobile/content/metadata` | Identidad compacta del snapshot (contrato de la app móvil actual) | `ETag: "<contentHash>"` |
| `GET /api/public/releases` | Últimas 50 publicaciones con su lista de cambios | revalidar |
| `GET /api/public/releases/{releaseId}/changelog.pdf` | Registro de cambios en PDF | inmutable |
| `GET /api/public/documents/{id o slug}` | Una ficha publicada (`procedure:301` o su slug) | revalidar |
| `GET /mobile-history/index.json`, `/mobile-history/{packageHash}/page-NNNN.json` | Historial paginado | índice revalidable, páginas inmutables |
| `GET /procedures/{slug}.md`, `/llms.txt`, `/llms-full.txt` | Markdown para agentes | revalidar |
| `GET /api/health` | `{ "ok": true }` si D1 responde | sin caché |
| `GET /docs/_versions/…`, `/images/_versions/…` | Adjuntos inmutables (por hash) | inmutable |

Las respuestas `200`, `304` y de error de estas rutas llevan además
`X-Manual-Release` (y, en las rutas actuales, `X-Manual-Content-Hash` y
`Last-Modified`). Si todavía no hay ninguna publicación activa responden `503`.

## Conjuntos de datos

`{nombre}` en las rutas de conjuntos. Coinciden con `content/data/*.json` cuando
existe ese fichero en el repositorio.

| Nombre | Forma |
| --- | --- |
| `procedures` | `MobileProcedure[]` (id, title, section, slug, content Markdown, attachments, related, editorialBlocks…) |
| `vademecum` | `MedicationRecord[]` |
| `vademecum-comerciales` | nombres comerciales → principio activo |
| `perfusiones`, `fluidos`, `abreviaturas` | arrays de registros |
| `codigos-incidente`, `codigos-sva`, `codigos-svb`, `codigos-upsi`, `codigos-upsq`, `codigos-icao`, `codigos-indicativos`, `codigos-pc`, `codigos-lima`, `codigos-cheatsheet` | arrays de códigos de cada grupo |
| `status4` | array de estados |
| `hospitals`, `bases` | arrays con coordenadas |
| `manual-updates` | eventos recientes de cambios |
| `main-links` | enlaces oficiales |
| `manual` | `{ manualVersion, manualVersionCurrent }` (edición oficial, p. ej. `v2.0 junio 2026`) |

Los tipos TypeScript de referencia están en `packages/manual-content/src/schema.ts`
(`MobileContent`). La lista exacta vigente es siempre `Object.keys(manifest.datasets)`;
un cliente debe ignorar nombres que no conozca y no fallar si falta uno opcional.

## Forma del manifiesto

```json
{
  "schema": "samur-manual.public-manifest",
  "version": 1,
  "releaseId": "19ab0247-66da-447f-9b5d-cc3a987dd042",
  "publishedAt": "2026-10-28T08:12:31.512Z",
  "generatedAt": "2026-10-28T08:12:00.248Z",
  "contentHash": "3fc29878…fdb168",
  "packageHash": "825420bc…71a1",
  "manualVersion": "v1.1 Mayo 2026",
  "snapshot": {
    "url": "/api/public/content",
    "immutableUrl": "/api/public/releases/19ab0247-…/snapshot"
  },
  "datasets": {
    "vademecum": {
      "url": "/api/public/datasets/vademecum.json",
      "immutableUrl": "/api/public/releases/19ab0247-…/datasets/vademecum.json",
      "sha256": "…",
      "bytes": 412345,
      "count": 187
    }
  }
}
```

- `contentHash`: hash canónico del contenido publicado; es también el `ETag` del
  manifiesto y del snapshot. Cambia si y solo si cambia lo publicado.
- `packageHash`: identidad del paquete móvil (contenido + adjuntos), la misma que usa
  `apps/mobile` para el historial.
- `publishedAt`: momento en que se activó la publicación (ISO 8601, UTC).
- `sha256`/`bytes`: de los bytes exactos que sirve `url`. `count` es `null` si el
  conjunto no es un array.
- `schema`/`version`: un cambio incompatible incrementará `version`; los campos nuevos
  se añaden sin incrementarla.

## CORS

Todas las rutas públicas devuelven `Access-Control-Allow-Origin: *`,
`Access-Control-Allow-Methods: GET, HEAD, OPTIONS`,
`Access-Control-Allow-Headers: If-None-Match, If-Modified-Since` y
`Access-Control-Expose-Headers: ETag, Last-Modified, X-Manual-Release, X-Manual-Content-Hash`.
`OPTIONS` responde `204`. No se usan cookies ni credenciales. `/api/editor/*` y
`/gestion-editorial` no tienen CORS y exigen Cloudflare Access.

## Errores

JSON `{ "error": "<mensaje en español>" }` con `404` (ruta, conjunto, publicación o
ficha inexistente), `405` (método), `503` (aún sin publicación o sin manifiesto).

## Publicaciones anteriores a esta API

Las publicaciones nuevas generan los conjuntos y `manifest.json` al compilarse
(`scripts/backend/public-datasets.ts`). Para una publicación ya activa se añaden sin
cambiar su contenido con:

```bash
node --experimental-strip-types scripts/backend/cli.ts backfill-datasets --remote --env production
```
