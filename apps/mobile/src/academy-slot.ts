/**
 * Configuración pura del anuncio de la academia (issue #100).
 *
 * Las decisiones de marca viven en `academy-slot-config.ts`; este archivo solo
 * contiene el contrato y las reglas que se pueden probar sin cargar PNGs nativos.
 *
 * Dos decisiones que conviene no deshacer sin pensarlo:
 *
 *  - Nada de red. La creatividad tendra que venir dentro del paquete, como el
 *    resto del contenido: la app funciona en guardia, a veces sin cobertura, y un
 *    anuncio que bloquee el arranque esperando una imagen es inaceptable.
 *  - En la primera apertura se enseña despues del aviso de primer uso y se marca
 *    como visto de forma persistente. No vuelve a interrumpir una guardia en
 *    sesiones posteriores.
 */
import type { ImageSourcePropType } from "react-native";

export interface AcademySlot {
  /** Texto de la tarjeta en ajustes. */
  title: string;
  detail: string;
  /** A donde lleva. Se abre en el navegador del sistema. */
  url: string;
  /** Imagen empaquetada, opcional, para el arranque. */
  splashImage?: ImageSourcePropType;
}

/**
 * ¿Se enseña la promoción en la primera apertura?
 *
 * Solo con creatividad local, con el aviso de primer uso ya aceptado y si todavía
 * no se ha marcado como vista. Lo último se guarda en preferencias, no en memoria
 * de sesión, porque el acuerdo es mostrarla una sola vez al instalar la app.
 */
export function shouldShowAcademySplash(
  slot: AcademySlot | undefined,
  disclosureAccepted: boolean,
  alreadySeen: boolean,
): boolean {
  return Boolean(slot?.splashImage) && disclosureAccepted && !alreadySeen;
}

/** ¿Se enseña la entrada en ajustes? Basta con que haya algo a donde ir. */
export function shouldShowAcademyEntry(slot: AcademySlot | undefined): boolean {
  return Boolean(slot?.url);
}
