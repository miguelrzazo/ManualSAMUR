# Despliegue verificado — 28 de octubre de 2026

- Web/API: https://manualsamur.miguelrzazo13.workers.dev
- Archivos: https://manualsamur-files.miguelrzazo13.workers.dev
- Worker principal: `13e9c7c6-96e2-416b-90d2-9dee100953dd`.
- Worker de archivos: `db5073ec-7b21-4c47-8296-b8ca6e3c981c`.
- D1: `manualsamur-production`, `dfb4af8a-3eab-4adf-98ba-2886f1d49272`.
- Jurisdicción D1: `eu`, región de ejecución informada `EEUR`.
- Migración aplicada: `0001_editorial.sql`.
- Publicación activa: `19ab0247-66da-447f-9b5d-cc3a987dd042`.
- Hash público: `3fc29878b6fcbe24c3a843ca6b1d0da193497c5506ef28fad2aec94575fdb168`.

Se importaron 234 documentos editoriales y se publicaron 223 procedimientos. El
cliente compartido validó el snapshot descargado desde Internet y su identidad con
los metadatos activos. Se verificaron también los bytes de un adjunto mediante su
SHA-256 y tamaño, la firma PDF del changelog, la salud HTTP 200 y la identidad del
historial móvil. Hay 318 referencias a adjuntos: cinco no tienen copia verificable
en origen y siguen señaladas como no disponibles, sin promesa de uso offline.

Chromium verificó siete rutas de esta publicación remota a 1440 y 390 píxeles:
manual, procedimiento 301 con sus once bloques editoriales, códigos, ficha de
medicamento, abreviaturas, cambios y Acerca de. No se detectaron errores de página
ni desbordamiento horizontal. La base tiene nueve tablas y ocupa 37,7 MB tras la
primera publicación; la versión principal recibe el 100 % del tráfico.

La cuenta fue confirmada por su propietario como Workers Free. No se activó ningún
plan de pago ni R2. Arranque informado por Cloudflare: 2 ms. Las cuotas gratuitas
siguen siendo límites de funcionamiento, no una garantía de disponibilidad ilimitada.

El despliegue real permitió corregir una diferencia de Wrangler: las lecturas D1
remotas deben usar `--command`; los imports `--file` emiten progreso incluso con
`--json` y no devuelven las filas de SELECT. La corrección se probó importando y
publicando contra esta base remota.

## Pendiente de configuración del propietario

- La aplicación de Cloudflare Access y la autenticación de la identidad editorial.
  Sin su configuración, `/gestion-editorial` y `/api/editor/documents` responden
  401; los borradores y las notas no se exponen públicamente.
- Secretos de Cloudflare/GitHub para los workflows y el inicio de publicación desde
  el editor. OAuth de Wrangler no autoriza administrar Access ni sustituye las
  credenciales duraderas de CI. Véase [credentials.md](credentials.md).
- Integrar el PR antes de usar el nuevo workflow de publicación en la rama principal.
- Generar y verificar las nuevas builds nativas con el origen Cloudflare ya registrado.

El estado de Access y automatización debe actualizarse con evidencia real cuando se
complete su configuración; publicar la API no demuestra que esos pasos estén listos.
