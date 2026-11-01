# Lista de capturas para la prueba interna

Capturar la candidata firmada exacta en iPhone y Android aprobados. Usar solo datos sintéticos,
sin banners de desarrollo, terminales, logs, PHI ni identificadores personales. Conservar la
resolución original y anotar plataforma, modelo, OS, versión, commit y SHA-256.

1. **Primer arranque:** aviso de adaptación independiente y fuente oficial.
2. **Inicio:** árbol del manual, contenido local disponible y accesos a recientes/guardados.
3. **Buscar:** búsqueda con resultados en Procedimientos, Vademécum y Códigos.
4. **Detalle de procedimiento:** título, contenido y tabla horizontal legible.
5. **Vademécum:** lista de fármacos/perfusiones/fluidos y un detalle de referencia.
6. **Códigos:** lista y detalle de un código con navegación de vuelta.
7. **Anexo:** PDF incluido offline y estado/enlace explícito para una referencia no disponible.
8. **Guardados y Recientes:** elementos sintéticos ordenados y controles accesibles.
9. **Mapa offline:** directorio y esquema con permiso de ubicación denegado.
10. **Mapa online/fallback:** mapa opcional con atribución; si falla la red, directorio y
    esquema offline.
11. **Información y ajustes:** estado de sincronización, aviso no oficial, fuente oficial,
    privacidad/ubicación y apariencia.
12. **Actualización/recovery:** paquete pendiente, validación y conservación del último paquete
    válido tras una actualización interrumpida.

Las capturas son evidencia de comportamiento de la build y no sustituyen la revisión humana de
accesibilidad, tamaño, rendimiento, batería o instalación.

## App Store en iPhone Duo

Preparar capturas de la interfaz real en español, sin marcos de dispositivo ni textos promocionales
superpuestos. Guardar los PNG originales bajo `release/app-store/iphone-duo/es/` y separarlos por
pantalla (`outer` / `inner`) y pose (`portrait` / `landscape`). Apple acepta estas dimensiones:

| Pantalla | Vertical | Horizontal |
| --- | ---: | ---: |
| Exterior | 1398 × 2034 px | 2034 × 1398 px |
| Interior | 2007 × 2853 px | 2853 × 2007 px |

Para cada una de las cuatro combinaciones, capturar Inicio, Buscar con una consulta breve, un
procedimiento, Vademécum y Códigos. Añadir también la serie de iPhone grande existente y registrar
modelo, versión de iOS, versión de la app, commit y SHA-256 con cada lote. Validar dimensiones y
ausencia de canal alfa antes de subir a App Store Connect. La interfaz debe adaptarse al cambio de
ancho disponible: la navegación pasa a una columna lateral cuando el espacio permite presentarla.

Estado (31-10-2026, build Release 1.0.0 (8), simulador iPhone Duo con iOS 27.1, issue #101):
capturada la combinación **exterior / vertical** (`outer/portrait/`, 1398 × 2034, sin alfa):
Inicio, Buscar ("ictus"), procedimiento 301, Vademécum (adrenalina) y Códigos. El simulador
arranca plegado y, sin la interfaz de Simulator, no se puede desplegar ni girar la pantalla
exterior (XCTest no aplica la orientación horizontal en ese display), así que faltan las
combinaciones **exterior / horizontal**, **interior / vertical** e **interior / horizontal**.
Se capturan desde Simulator (Device > Unfold y rotación) con el mismo recorrido; la serie de
iPhone grande está en `app-store/framed/iphone-6.9/`.

