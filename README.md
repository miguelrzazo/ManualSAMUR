# SAMUR Manual

Adaptación digital no oficial del Manual de Procedimientos de SAMUR-Protección Civil de Madrid.

El contenido clínico pertenece a SAMUR-PC / Ayuntamiento de Madrid. Esta aplicación no tiene relación oficial con SAMUR.

El backend editorial, la base D1 y el despliegue gratuito por CLI se documentan en
[docs/backend/README.md](docs/backend/README.md).

## Características

- Procedimientos de emergencias prehospitalarias (SVA, SVB, Operativos, Técnicas, Comunicaciones, Psicológicos, Administrativos, DRP, Intervinientes)
- Vademécum de fármacos con dosis y vías de administración
- Códigos radio y claves de comunicación
- Mapa interactivo de hospitales y bases
- Relaciones entre procedimientos; rediseño del grafo previsto en #29
- Búsqueda global con filtros por tipo (`:p` procedimientos · `:c` códigos · `:v` medicamentos) y búsqueda a texto completo dentro de los procedimientos
- Abreviaturas y colaboradores
- Historial de actualizaciones y avisos de novedades
- Modo oscuro, PWA, soporte para móvil
- Superficie Expo para iOS/Android en `apps/mobile/`, con contenido local y actualizaciones verificadas por hash

## Desarrollo

```bash
npm run dev        # Servidor de desarrollo (http://localhost:3000)
npm run build      # Build de producción (sincroniza docs, genera datos de cliente y llms.txt)
npm run lint       # ESLint
npm test           # Tests (runner nativo de Node)
```

### Scripts de sincronización

```bash
npm run sync:manualsamur:detect  # Simulación: informa de cambios sin escribir nada
npm run sync:manualsamur:apply   # Sincronización real desde el wiki oficial
npm run sync:vademecum           # Sincronizar vademécum
npm run generate:llms            # Regenerar llms.txt y llms-full.txt
npm run generate:client-data     # Regenerar los datasets bajo demanda de public/
npm run mobile:content           # Regenerar el paquete offline de la app Expo
npm run mobile:typecheck         # Typecheck de la superficie nativa
```

Los cambios editoriales se publican desde D1 mediante un paquete verificado compartido
por la web y la app, sin reconstruir el frontend. La app consulta
`/api/mobile/content/metadata` y activa automáticamente las actualizaciones verificadas,
conservando la última copia válida sin conexión. Los adjuntos nuevos se descargan por Wi-Fi;
su descarga con datos móviles es manual.

La sincronización mensual en `.github/workflows/update-content.yml` crea propuestas de
origen pendientes de revisión editorial. `publish-content.yml` compila las revisiones
aprobadas y despliega sus adjuntos con Wrangler antes de activar la publicación.

## Acceso para LLMs

El contenido está disponible en formato [llms.txt](https://llmstxt.org) para uso con LLMs y agentes de IA:

- `/llms.txt` — Índice de todos los procedimientos con URLs
- `/llms-full.txt` — Contenido completo de todos los procedimientos en texto plano

Ejemplo de uso con Claude u otro LLM:

```
Consulta /llms.txt en el origen Cloudflare configurado para obtener el índice.
Consulta /llms-full.txt para el contenido completo de la publicación activa.
O accede a /manual/301-parada-cardiorrespiratoria para leer un procedimiento.
```

## Arquitectura

- **Next.js 16** con App Router, React 19, TypeScript, Tailwind CSS
- **Export estático** (`output: "export"`): no hay servidor en producción, solo ficheros en CDN.
  Como consecuencia, cualquier comparación de fechas debe hacerse en cliente — en servidor
  quedaría congelada en el momento del build. Ver el hook `lib/hooks/use-now.ts`.
- **Contenido**: Markdown en `content/procedures/` (10 subcarpetas por sección), datos JSON en `content/data/`
- **Paquete compartido**: `packages/manual-content/` define el contrato, serialización, validación,
  hashes y relaciones que consumen la web y las superficies iOS/Android; los adaptadores de
  compilación mantienen el acceso al sistema de archivos fuera del paquete.
- **Datos de cliente**: `public/search-index.json`, `public/manual-updates.json` y
  `public/manual-history.json` se generan en el build y se descargan bajo demanda, para
  no inflar el HTML de cada página
- **Scraping**: Scripts en `scripts/` que sincronizan desde el wiki oficial XWiki
- **Visualización**: D3-force para grafo local, React Flow para grafo global

## Integración y CI

El trabajo sobre `main` exige una aprobación y el check requerido `build`. El workflow
`.github/workflows/ci.yml` conserva ese nombre, ejecuta lint, IDs, tests y build, y admite
ejecución manual. Vercel mantiene despliegues Preview para pull requests; el PR mensual
usa `CONTENT_PR_TOKEN` cuando está configurado para que el check `build` se dispare también
en cambios automáticos.

## Stack técnico

- Next.js 16, React 19, TypeScript
- Tailwind CSS v4, Radix UI / shadcn
- next-mdx-remote (rendering de procedimientos)
- D3 (grafos de relaciones), MapLibre GL (mapa)
