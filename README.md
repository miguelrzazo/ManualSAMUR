# SAMUR Manual

Adaptación digital no oficial del Manual de Procedimientos de SAMUR-Protección Civil de Madrid.

El contenido clínico pertenece a SAMUR-PC / Ayuntamiento de Madrid. Esta aplicación no tiene relación oficial con SAMUR.

## Características

- 226 procedimientos de emergencias prehospitalarias (SVA, SVB, Operativos, Técnicas, Comunicaciones, Psicológicos, Administrativos)
- Vademécum de fármacos con dosis y vías de administración
- Códigos radio y claves de comunicación
- Mapa interactivo de hospitales y bases
- Grafo de relaciones entre procedimientos
- Modo oscuro, PWA, soporte para móvil

## Desarrollo

```bash
npm run dev        # Servidor de desarrollo (http://localhost:3000)
npm run build      # Build de producción (también genera llms.txt)
npm run lint       # ESLint
```

### Scripts de sincronización

```bash
npm run sync:manualsamur   # Sincronizar procedimientos desde el wiki oficial
npm run sync:vademecum     # Sincronizar vademécum
npm run generate:llms      # Regenerar llms.txt y llms-full.txt
```

## Acceso para LLMs

El contenido está disponible en formato [llms.txt](https://llmstxt.org) para uso con LLMs y agentes de IA:

- `/llms.txt` — Índice de todos los procedimientos con URLs
- `/llms-full.txt` — Contenido completo de todos los procedimientos en texto plano

Ejemplo de uso con Claude u otro LLM:

```
Fetch https://manualsamur.es/llms.txt para obtener el índice de procedimientos.
Fetch https://manualsamur.es/llms-full.txt para el contenido completo.
O accede a un procedimiento individual: https://manualsamur.es/manual/301-parada-cardiorrespiratoria
```

## Arquitectura

- **Next.js 16** con App Router, React 19, TypeScript, Tailwind CSS
- **Contenido**: Markdown en `content/procedures/`, datos JSON en `content/data/`
- **Scraping**: Scripts en `scripts/` que sincronizan desde el wiki oficial XWiki
- **Visualización**: D3-force para grafo local, React Flow para grafo global

## Stack técnico

- Next.js 16, React 19, TypeScript
- Tailwind CSS v4, Radix UI / shadcn
- next-mdx-remote (rendering de procedimientos)
- D3 (grafos de relaciones), MapLibre GL (mapa)
- Capacitor (wrapper nativo iOS)
