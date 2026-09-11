# Auditoría estática de issues de interfaz

Fecha: 2026-09-07  
Alcance: issues abiertos 72, 73, 74, 76, 80, 81, 83, 84, 85, 86, 87, 90, 92, 93, 96, 98.

Esta auditoría compara los criterios publicados con el código y las pruebas disponibles. No sustituye una pasada manual en dispositivos y no cierra issues.

| Issue | Evidencia en el repositorio | Estado estático |
|---|---|---|
| 72 | `lib/manual-data.ts` normaliza wrappers XWiki; `tests/manual-data.test.ts` y `tests/mobile-snapshot.test.ts` cubren que no se filtren `(((`. | Implementado en código y cubierto; falta validar una sincronización real completa. |
| 73 | `apps/mobile/App.tsx` tiene TOC colapsable, estado expandido, salto a anclas y control fijado; `components/manual/TableOfContents.tsx` usa `<details>` y enlaces. | Implementado; falta revisión visual/teclado en navegador y lector de pantalla. |
| 74 | `ProcedureScreen` usa el nombre como título y conserva el ID en metadatos; la página web usa el nombre en `h1` y metadata. | Implementado en código; falta comprobación de corpus completo. |
| 76 | `ProcedureScreen` renderiza relaciones salientes/entrantes; web usa `getRelatedProcedures`/`getBacklinkProcedures`; `tests/mobile-procedures.test.ts` cubre resolución y enlaces. | Implementado; falta comparación exhaustiva web/móvil con fixtures. |
| 80 | `apps/mobile/src/manual-tree-logic.ts` y `components/manual/ManualHomeClient.tsx` contienen la regla de sección de un solo subgrupo. | Parcial: hay lógica de aplanado, pero falta una prueba de regresión específica para Psicológicos en ambas superficies. |
| 81 | No quedan coincidencias de `Traumatismo de Facial` en el corpus de contenido inspeccionado; sí aparecen títulos `Traumatismo Facial`. | Resuelto según búsqueda estática; falta comprobar la página generada y búsqueda móvil. |
| 83 | `apps/mobile/src/MapaScreen.tsx` solicita ubicación tras acción del usuario y conserva fallback accesible; `tests/mobile-mapa.test.ts` cubre la política. | Implementado en código y cubierto; falta permiso real en iOS/Android. |
| 84 | `SettingsModal` centraliza apariencia, actualización, recuperación, privacidad y abreviaturas; sus controles tienen nombres accesibles. | Implementado en código; falta revisión visual contra el diseño aprobado. |
| 85 | `apps/mobile/src/screens/HistorialScreen.tsx`, `ProcedureHistorySection` y `components/manual/ManualHomeClient.tsx` exponen novedades/historial. | Implementado en código; falta evidencia visual y de fechas con datos reales. |
| 86 | `ProcedureHistorySection` se monta en procedimientos y códigos; `tests/mobile-procedure-history.test.ts` cubre filtrado/orden. | Implementado en código y cubierto. |
| 87 | `classifyMarkdownRows` numera listas de forma determinista; `tests/mobile-procedures.test.ts` cubre reinicio y listas sueltas. | Implementado en código y cubierto. |
| 90 | `CodeScreen` muestra procedimientos relacionados e historial de eventos de código; `tests/mobile-codigos.test.ts` cubre relaciones. | Implementado en código; falta fixture visual de una ficha con historial. |
| 92 | `BuscarScreen` mantiene una sola fila de alcance y no monta una segunda taxonomía al elegir Vademécum; `tests/mobile-reference-search.test.ts` cubre ámbitos. | Implementado en código y cubierto. |
| 93 | Buscar tiene campo persistente, resultados de procedimientos/referencias y snippets destacados; `tests/mobile-procedures.test.ts` cubre snippets. | Implementado en código; falta medición manual de prominencia y lectura con texto grande. |
| 96 | `SearchStartingPoints` separa búsquedas recientes de referencias consultadas y filtra referencias obsoletas; la web mantiene recents tipados de procedimientos. | Parcial: móvil ya filtra referencias resolubles, pero la aceptación de “solo procedimientos” necesita una prueba explícita. |
| 98 | Tokens compartidos (`spacing`, `radii`, `typography`, `motion`) y `Press` centralizan forma, objetivos táctiles y feedback; pruebas de accesibilidad y scroll pasan. | Parcial: hay cobertura estática amplia, pero faltan capturas y verificación manual de animación/reduced motion en dispositivos. |

## Comprobaciones ejecutadas

- `npx tsc --noEmit -p apps/mobile/tsconfig.json` — correcto.
- `node --experimental-strip-types --test tests/mobile-accessibility.test.ts tests/mobile-procedures.test.ts tests/mobile-vademecum.test.ts tests/mobile-codigos.test.ts tests/mobile-scroll-chrome.test.ts tests/mobile-attachments.test.ts` — 129 pruebas correctas en las ejecuciones focalizadas (61 en la última ejecución de procedimiento/scroll/anexos; 68 en la ejecución de accesibilidad/vademécum/códigos).
- Búsquedas estáticas del corpus para `Traumatismo de Facial` y wrappers `(((`/`)))`.

La auditoría no afirma evidencia de VoiceOver, TalkBack, permisos nativos, zoom real ni capturas de pantalla porque esas comprobaciones no se ejecutaron en esta pasada.
