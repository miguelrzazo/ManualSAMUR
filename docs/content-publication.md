# Publicación de contenido: web, app, Novedades e Historial

## Flujo de extremo a extremo

```text
Wiki oficial
    ↓
CI scraper → cambios detectados → PR de contenido
    ↓ aprobación y merge
Build único: datos web + snapshot móvil + ledger de cambios
    ↓ validaciones y smoke check público
Publicación coherente
    ├─ web: contenido actual + Novedades + Historial
    ├─ metadata: schema/version/contentHash/packageHash/fecha
    └─ app: snapshot local actualizado de forma atómica
```

La PR es la frontera editorial: hasta que no se aprueba y se mezcla, un cambio está
detectado pero no publicado. Vercel despliega el resultado del merge; la publicación se
considera correcta cuando metadata, paquete y contenido web comparten la misma identidad.

## Qué es cada cosa

- **Contenido**: el corpus actual que se consulta en web y app.
- **Novedades**: proyección reciente de cambios relevantes. Incluye altas, cambios con diff
  real y bajas; no incluye una simple revisión de fecha. La ventana actual es de 30 días y
  el estado leído/no leído vive en el dispositivo.
- **Historial**: proyección permanente de cambios relevantes, ordenada de más reciente a más
  antiguo, con resumen y diff cuando existe. No debe truncarse a 500 entradas.
- **Identidad de publicación**: `schema + version + contentHash + packageHash + generatedAt`.
  `contentHash` identifica el contenido y `packageHash` identifica contenido más manifiesto de
  anexos. Metadata y snapshot deben salir del mismo build.

## Qué hace la app

La búsqueda de referencias es local: procedimientos, códigos y vademécum se buscan en el
snapshot instalado. Por eso una búsqueda no necesita conexión. La red solo interviene para
comprobar y descargar una publicación nueva.

Al iniciar y al volver a primer plano, la app comprueba metadata. Hay una espera mínima de seis
horas entre comprobaciones automáticas; también existe refresco manual. Si el hash no cambia,
no descarga el paquete. Si cambia, descarga, valida schema, hash, rutas y anexos, y activa el
resultado mediante una única escritura transaccional. Si falla la red, la publicación es
incompatible o el paquete es inválido, conserva el último paquete bueno y lo comunica con un
estado distinto de “contenido actualizado”.

Los clientes ya instalados pueden seguir usando `/api/mobile/content/v2`; los nuevos usan
`/api/mobile/content/v3`. Ambos sirven el snapshot vigente y metadata/paridad se comprueban en CI.

## Reglas de CI

La CI debe bloquear la PR si ocurre cualquiera de estas situaciones:

1. El ledger contiene eventos duplicados o un evento carece de identidad estable.
2. Web, metadata y snapshot móvil no comparten hashes.
3. Schema, versión, manifiesto de anexos o snapshot no validan.
4. El build modifica el árbol de trabajo después de generar los artefactos.
5. El smoke check público devuelve metadata de una publicación distinta al paquete.

La generación de historial vive en `scripts/update-manual-history.ts`, no en un bloque inline de
YAML. Así la deduplicación y la regla “revisión sin diff no es novedad” se pueden probar y
reutilizar localmente.

## Estado de esta entrega

Ya están aplicados el contrato v3, el alias compatible v2, la activación automática atómica,
la comprobación al volver a primer plano, el estado explícito de publicación incompatible, la
identidad estable de eventos y el historial sin límite artificial en el pipeline.

El Historial móvil se sirve como páginas estáticas asociadas a la identidad de publicación y se
cachea por `publicationIdentity + página`. Así el paquete móvil solo contiene Novedades recientes:
online se puede consultar todo el Historial por páginas y, sin conexión, solo las páginas que el
dispositivo haya cacheado.
