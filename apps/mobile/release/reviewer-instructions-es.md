# Instrucciones para revisión interna

Aplicación: **Manual SAMUR** (`es.madrid.samur.manual`). Propietario de la candidata:
Miguel Rosa Zazo. La prueba TestFlight está limitada a `miguelrzazo13@gmail.com`.

## Recorrido recomendado

1. En el primer arranque, leer y aceptar el aviso de adaptación independiente.
2. Con el dispositivo en modo avión, abrir Inicio, Buscar, Procedimientos, Vademécum, Códigos,
   Guardados y Ajustes. Buscar una referencia de procedimiento, un fármaco y un código; abrir
   sus detalles.
3. Guardar y quitar un procedimiento, un fármaco, un código, un hospital y una base. Confirmar
   el orden de Guardados y Recientes.
4. Abrir un anexo que esté incluido en el paquete y confirmar que se puede leer sin red.
   Para un anexo no disponible, confirmar que se ofrece únicamente el enlace a la fuente
   oficial.
5. En Mapa, usar el directorio y el esquema sin conceder ubicación. Después denegar el permiso
   cuando se solicite y confirmar que el directorio sigue funcionando.
6. Con red, activar el mapa online solo si el entorno de prueba permite la validación del
   proveedor. Una caída de red o del proveedor debe volver al directorio y al esquema offline.
7. En Información y ajustes, comprobar que se identifica como adaptación no oficial y que no
   se solicitan cuentas ni datos de pacientes.

## Alcance y límites

Usar únicamente datos sintéticos. No pegar, fotografiar ni conservar PHI, identificadores de
paciente, casos, domicilios, fechas de nacimiento, teléfonos ni narrativas clínicas. La app no
recoge cuentas, analítica obligatoria ni sincronización entre dispositivos. El contenido debe
contrastarse con la fuente oficial antes de un uso operativo o clínico.

## Evidencia que debe adjuntarse

Registrar modelo y OS aprobados, commit, hash SHA-256, tamaño en bytes, propietario y fecha de
cada candidato. Adjuntar capturas sintéticas, resultados de VoiceOver/TalkBack, texto grande,
movimiento reducido, contraste, foco y objetivos táctiles. El revisor debe anotar la fecha y
resultado en los checklists de campo y revisión humana. La revisión no autoriza subida pública,
producción, rollout, pausa, rollback ni publicación en App Store o Google Play.
