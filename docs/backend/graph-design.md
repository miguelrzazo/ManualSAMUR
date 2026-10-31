# Grafo de relaciones del manual — diseño para #29

Estado: propuesta de arquitectura e interacción. No incorpora una nueva interfaz de grafo ni modifica relaciones clínicas automáticamente.

## Un modelo con procedencia

Los nodos son procedimientos (ID estable), medicamentos (ID), códigos (familia + código), documentos adjuntos (ID) y, si el contenido lo justifica, conceptos revisados. El título y la dirección se resuelven desde la publicación activa; un slug nunca es la identidad. Los nodos archivados conservan su identidad histórica y no se presentan como instrucciones vigentes.

Cada arista declara `id`, `from`, `to`, `kind`, `direction`, `strength`, `provenance`, `sourceRevisionId`, `releaseId`, `evidence`, `reviewState`. Tipos iniciales: `explicit-reference`, `related-procedure`, `mentions-drug`, `mentions-code`, `supersedes`. `evidence` contiene sección, cita breve y posición si está disponible. `provenance` distingue referencia oficial explícita, relación editorial revisada y coincidencia automática. No se infieren equivalencias terapéuticas ni prioridades asistenciales a partir de cercanía visual. Una coincidencia automática queda como candidata; su publicación requiere revisión.

Los índices inversos se derivan de las mismas aristas de una única publicación. Una referencia rota bloquea su publicación o se registra explícitamente como referencia externa sin nodo resoluble. La transición entre releases cambia nodos y aristas juntos. No se mezclan índices de distintas versiones. La autoría y los registros internos de revisión no se incluyen en la API pública.

## Tres formas de consultar

- **Búsqueda:** texto, sinónimos, ID y filtros por tipo y sección; selección explícita de un resultado.
- **Vista enfocada:** nodo elegido, vecinos a un salto y lista de relaciones con tipo y procedencia. La expansión de un segundo salto es voluntaria y conserva el contexto.
- **Vista global:** agrupación por sección, límites de densidad y filtros. Al seleccionar un nodo se pasa a la vista enfocada. Ningún tamaño, color o distancia representa importancia clínica.

La lista accesible es una representación completa equivalente al lienzo: cada relación puede abrirse y mostrar su evidencia. Los controles permiten restablecer vista, buscar y filtrar sin depender de gestos. El historial conserva foco, filtros y nodo al volver del procedimiento.

## Teléfono, teclado y accesibilidad

En teléfono, vista enfocada inicial, panel inferior de detalle y objetivos táctiles de al menos 44 px. Arrastre y zoom son complementarios a botones visibles; nunca se exige una pinza. El panel no oculta el nodo ni el foco de teclado. El lienzo no intercepta el desplazamiento de página hasta activación explícita.

Tabulador recorre controles y lista; Enter abre nodo, Escape cierra panel y devuelve el foco. Anuncios de lector de pantalla indican filtros, número de resultados y expansión completada. Se respetan contraste, modo oscuro y movimiento reducido; tipo y estado usan texto/icono además del color. La búsqueda funciona sin ejecutar el motor de disposición.

## Datos, rendimiento y aceptación

La API entrega el subgrafo y su `releaseId`/hash; el cliente descarta respuestas de una versión que dejó de estar activa. Límites de nodos/aristas y disposición fuera del hilo principal evitan bloquear la lectura. La instantánea verificada puede alimentar la vista sin conexión, señalando su fecha.

Antes de implementar: acordar vocabulario de aristas y política de evidencias con revisión editorial. La aceptación exige búsquedas con sinónimos y acentos; referencias rotas y nodos archivados; ciclos y nodos sin relaciones; publicación durante navegación; red interrumpida; grafo denso; teléfono real; navegación completa con teclado y lector de pantalla; ausencia de datos internos de editores en red, exportaciones y cachés públicas.
