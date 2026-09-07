/**
 * Las novedades de la aplicación, versión a versión.
 *
 * No confundir con `Historial`, que es el registro de cambios del *contenido* del
 * manual y viene en el paquete. Esto es el de la app, y se escribe a mano: nadie más
 * lo sabe.
 *
 * Está vacío a propósito en la 1.0.0. La primera versión no tiene novedades respecto a
 * nada, y una entrada inventada ("Versión inicial. Mejoras y correcciones.") es ruido
 * que además enseña al lector que esta pantalla no dice nada útil.
 */
export interface AppReleaseNote {
  version: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  changes: string[];
}

export const APP_CHANGELOG: readonly AppReleaseNote[] = [];
