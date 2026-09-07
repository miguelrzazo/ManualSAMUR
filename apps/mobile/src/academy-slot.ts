/**
 * El hueco para el anuncio de la academia (issue #98).
 *
 * Se construye el sitio, no el anuncio: no hay creatividad, ni descarga, ni
 * medicion, ni identificadores. Mientras `academySlot` sea `undefined` la app se
 * comporta exactamente igual que ahora, y cuando haya arte basta con rellenarlo.
 *
 * Dos decisiones que conviene no deshacer sin pensarlo:
 *
 *  - Nada de red. La creatividad tendra que venir dentro del paquete, como el
 *    resto del contenido: la app funciona en guardia, a veces sin cobertura, y un
 *    anuncio que bloquee el arranque esperando una imagen es inaceptable.
 *  - En el arranque solo se enseña una vez por sesion y nunca antes del aviso de
 *    primer uso. La pantalla de lanzamiento dura lo que tarda en hidratarse el
 *    contenido; si algun dia no hay nada que cargar, no aparece.
 */
export interface AcademySlot {
  /** Texto de la tarjeta en ajustes. */
  title: string;
  detail: string;
  /** A donde lleva. Se abre en el navegador del sistema. */
  url: string;
  /** Imagen empaquetada, opcional, para el arranque. */
  splashImage?: string;
}

/**
 * Sin configurar. Rellenar cuando exista la creatividad; hasta entonces ni la
 * entrada de ajustes ni el hueco del arranque se dibujan.
 */
export const academySlot: AcademySlot | undefined = undefined;

/**
 * ¿Se enseña el hueco en el arranque?
 *
 * Solo con creatividad de arranque, con el aviso de primer uso ya aceptado y una
 * vez por sesion. Lo tercero importa: la pantalla de lanzamiento reaparece cada
 * vez que se reactiva la app, y un anuncio en cada vuelta desde el bloqueo seria
 * insufrible en mitad de un servicio.
 */
export function shouldShowAcademySplash(
  slot: AcademySlot | undefined,
  disclosureAccepted: boolean,
  alreadyShownThisSession: boolean,
): boolean {
  return Boolean(slot?.splashImage) && disclosureAccepted && !alreadyShownThisSession;
}

/** ¿Se enseña la entrada en ajustes? Basta con que haya algo a donde ir. */
export function shouldShowAcademyEntry(slot: AcademySlot | undefined): boolean {
  return Boolean(slot?.url);
}
