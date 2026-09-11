# Informe de preparación — 2026-09-07

## Resultado

Estado: **BLOQUEADO para una prueba interna firmada**. El paquete de evidencia generado es
`artifacts/mobile-release-evidence.json` y el handoff es
`artifacts/mobile-internal-test-handoff.json`.

## Comprobaciones reproducibles

- `npm run mobile:release:evidence` terminó correctamente y registró el estado bloqueado.
- `npm run mobile:content:validate` terminó correctamente; snapshot válido, 223 procedimientos
  y 318 anexos.
- `npm run mobile:typecheck` terminó correctamente.
- `attachments:check-release`, `locations:check-release` y `online-map:check-release` terminaron
  correctamente. El paquete registra 59.229.860 bytes esenciales/instalados.
- Hash del paquete móvil observado: `c9d2675ca21cbcf08a75b979ed8d3ee169f97ce6c69948dd58537890695d3ca1`.

## Bloqueos del entorno

- Node activo: `v26.7.0`; el proyecto exige Node `>=22.13.0 <23`. Repetir instalación y builds
  con Node 22 antes de firmar. No se encontró un runtime Node 22 local.
- Xcode `26.6` está instalado y el host tiene una identidad válida de desarrollo:
  `Apple Development: Miguel Rosa Zazo (A5D727358E)`. Sigue faltando una identidad/perfil de
  distribución App Store para producir una candidata TestFlight.
- `asc` `4.5.0` tiene credenciales en el System Keychain (`diverlog`, key `PJGJ5K973A`). La
  comprobación de cuenta es válida; no se encontró la app `es.madrid.samur.manual` en la cuenta
  durante la consulta y no se hicieron escrituras remotas.
- `adb`, `sdkmanager` y Gradle están presentes; no hay Android físico conectado en esta sesión.
  El Android generado usa `debug.keystore` para `release`; eso no es una firma de distribución y
  debe sustituirse por un keystore controlado por el propietario. No exponer contraseñas ni
  archivos de credenciales.
- El iPhone físico aparece en `xctrace` como offline; hay un iPhone 17 Pro Simulator arrancado.
  El simulador permite smoke tests, pero no sustituye la validación física de ubicación,
  accesibilidad, batería ni tamaño instalado.

Las comprobaciones anteriores se repitieron con acceso elevado para distinguir limitaciones del
sandbox de bloqueos reales. El primer informe que indicaba cero identidades, ASC no configurado y
CoreSimulatorService inaccesible reflejaba la restricción del sandbox.

## Gates humanas pendientes

Elegir y aprobar iPhone y Android de referencia; completar field-validation y human-review;
proporcionar candidatos firmados iOS y Android con ruta, SHA-256, bytes, fecha y propietario;
decidir la prueba interna; y publicar las páginas HTTPS de privacidad y soporte en el origen web
verificado. Las gates públicas (App Store/Google Play, rollout, halt y rollback) siguen siendo
decisiones posteriores y separadas; en esta sesión no se autoriza carga Android en Google Play.

## Siguiente ejecución autorizada

Con Node 22 y los certificados/keystore del propietario, desde `apps/mobile`, los comandos
previstos son `eas build --platform ios --profile production` y `eas build --platform android
--profile production` (o `preview` para una distribución interna Android antes de firmar el
candidato final). Para una comprobación local nativa, `npm run ios` y `npm run android` requieren
un simulador/emulador disponible. Los artefactos deben copiarse a un directorio de handoff fuera
del código fuente, y registrarse con `shasum -a 256 <artifact>` y `stat -f %z <artifact>`.

Después, ejecutar el recorrido de
`reviewer-instructions-es.md`, completar los checklists y pasar el JSON completado a
`npm run mobile:release:evidence:strict -- --input=<evidence.json>`. El tooling local no sube ni
publica candidatos.
