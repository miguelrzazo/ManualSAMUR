# Iconos de Manual SAMUR

La fuente es `ManualSAMUR.icon`, un documento de Icon Composer. Contiene la ilustración
(una ambulancia blanca) sobre un degradado automático en el azul de identidad
(`display-p3:0.10005,0.29661,0.63281`, es decir `#1B4FA8`). Todo lo demás de esta carpeta
se deriva de ahí: si cambia el icono, se cambia el `.icon` y se vuelven a exportar las
variantes, no se retoca un PNG.

| Superficie | Fichero | Notas |
| --- | --- | --- |
| iOS, apariencia clara | `icon-ios-light.png` | `ios.icon.light` en `app.json`. |
| iOS, apariencia oscura | `icon-ios-dark.png` | `ios.icon.dark`. |
| iOS, apariencia teñida | `icon-ios-tinted.png` | `ios.icon.tinted`. Monocromo a propósito. |
| Android (heredado) y respaldo | `icon.png` | Copia del claro. Android aplica su propia máscara. |
| Android, icono adaptativo | `adaptive-icon-foreground.png` | Solo la ambulancia, con transparencia. El azul lo pone `android.adaptiveIcon.backgroundColor`. |
| Splash | `splash.png` | Misma ambulancia, más pequeña. El fondo lo pinta `splash.backgroundColor`. |
| Web, PWA y favicon | `public/icons/`, `public/favicon.png`, `public/apple-touch-icon.png`, `app/favicon.ico` | Generados a partir de `icon-ios-light.png`. |

Tres cosas que hay que respetar al reexportar:

1. **Icon Composer exporta la forma ya recortada**: las esquinas salen con alfa 0. El
   canal de iOS de Expo quita la transparencia y rellena de blanco, así que un PNG con
   esquinas transparentes deja un halo blanco alrededor del icono en la pantalla de
   inicio. Hay que cuadrar la imagen antes de colocarla.
2. **La variante teñida tiene que ser monocroma**: iOS mapea la luminancia sobre el tinte
   que elija la persona. Icon Composer hornea un morado de muestra en su exportación;
   hay que desaturarlo.
3. **`maskable` no es lo mismo que `any`**: en la PWA la ilustración tiene que caber en el
   80% interior para sobrevivir al recorte circular, por eso `public/icons/maskable-*.png`
   se genera con más aire que `icon-*.png`.

Validar a 16 px, 24 px, tamaño de lanzador, con las dos máscaras del sistema, en claro y
en oscuro, y en modo teñido antes de subir nada a la tienda.
