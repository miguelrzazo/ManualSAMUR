import type { ColorSchemeName } from "react-native";
import { adaptivePalette as palette, type AdaptivePalette as AdaptivePaletteType } from "@manual-samur/design-tokens";

export type MobileRoute = "Inicio" | "Codigos" | "VademecumList" | "Mapa" | "Buscar" | "Guardados" | "Procedimiento" | "Vademécum" | "Fármaco" | "Código" | "Ubicación" | "Ajustes";

/** Stable spoken names used by Voice Control and route-level accessibility checks. */
export const routeAccessibilityLabels: Record<MobileRoute, string> = {
  Inicio: "Inicio",
  Codigos: "Códigos",
  VademecumList: "Vademécum",
  Mapa: "Mapa",
  Buscar: "Buscar en el manual",
  Guardados: "Guardados",
  Procedimiento: "Procedimiento",
  "Vademécum": "Vademécum",
  "Fármaco": "Fármaco",
  "Código": "Código operativo",
  "Ubicación": "Ubicación",
  // "Ajustes", no "Información y ajustes": es el título que lleva la pantalla, y el
  // nombre hablado de un botón y el de su destino tienen que ser el mismo.
  Ajustes: "Ajustes",
};

export const accessibilityHints = {
  openDetail: "Abre la ficha para consultar su contenido.",
  toggleFavorite: "Cambia si esta referencia aparece en Guardados.",
  openMap: "Abre el punto en la aplicación Mapas del dispositivo.",
  dismiss: "Cierra esta pantalla y devuelve el foco al elemento que la abrió.",
  search: "Escribe términos, identificadores o texto del manual.",
  switchTab: "Cambia a esta sección de la navegación principal.",
  share: "Abre las opciones para compartir este procedimiento.",
} as const;

/** Stable selectors shared by the real tab bar and the reader's floating copy. */
export function navigationTestID(route: string): string {
  return `tab-${route === "VademecumList" ? "vademecum" : route.toLowerCase()}`;
}

/**
 * The palette now lives in `@manual-samur/design-tokens` so the app has exactly
 * one definition of each colour role. It is re-exported here because this module
 * is the historical import site for accessibility checks and tests.
 */
export { adaptivePalette, type AdaptivePalette } from "@manual-samur/design-tokens";

export function resolveAdaptivePalette(scheme: ColorSchemeName): AdaptivePaletteType {
  return scheme === "dark" ? palette.dark : palette.light;
}

export function accessibilityTargetStyle(minimum = 44) {
  return { minWidth: minimum, minHeight: minimum } as const;
}

export interface AdaptiveLayout {
  /** Window width at or above `WIDE_LAYOUT_MIN_WIDTH`: the tab bar becomes a vertical rail. */
  isWideLayout: boolean;
  /**
   * The area beside the rail is itself wide: Manual, Vademécum and Códigos show the list
   * and the detail side by side instead of pushing the detail over the list.
   */
  isTwoPane: boolean;
  singleColumn: boolean;
  listMaxWidth: number;
  readingMaxWidth: number;
  /** Width the vertical rail takes from the window; 0 when navigation sits at the bottom. */
  railWidth: number;
  /** Width of the list column in a two-pane layout; the full width otherwise. */
  listPaneWidth: number;
}

/**
 * One breakpoint for the whole app. A closed iPhone Duo (466 pt), any iPhone in portrait
 * and iPad Slide Over / narrow Split View stay below it; an open iPhone Duo, iPad full
 * screen and wide Split View clear it.
 */
export const WIDE_LAYOUT_MIN_WIDTH = 600;
/** The vertical navigation rail, laid out beside the content (not over it). */
export const NAVIGATION_RAIL_WIDTH = 94;

/**
 * Deterministic same-IA layout policy for phones, tablets, foldables and large text.
 *
 * Two-pane reuses the same breakpoint, applied to what is left after the rail: the
 * list and the detail only split once the content area alone is as wide as the
 * window that earned the rail. An open iPhone Duo in landscape (951 pt), iPad full
 * screen in either orientation and two-thirds Split View split; an open Duo held in
 * portrait (669 pt) keeps the rail with a single, readable column.
 */
export function adaptiveLayout(width: number, fontScale: number): AdaptiveLayout {
  const isWideLayout = width >= WIDE_LAYOUT_MIN_WIDTH;
  const railWidth = isWideLayout ? NAVIGATION_RAIL_WIDTH : 0;
  const contentWidth = width - railWidth;
  const isTwoPane = isWideLayout && contentWidth >= WIDE_LAYOUT_MIN_WIDTH;
  const singleColumn = width < 420 || fontScale >= 1.75;
  const listPaneWidth = isTwoPane ? Math.round(Math.min(400, Math.max(320, contentWidth * 0.38))) : contentWidth;
  return {
    isWideLayout,
    isTwoPane,
    singleColumn,
    listMaxWidth: isWideLayout ? 1040 : width,
    readingMaxWidth: isWideLayout ? 720 : width,
    railWidth,
    listPaneWidth,
  };
}

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) throw new Error(`Invalid color token: ${hex}`);
  return 0.2126 * channel(Number.parseInt(value.slice(0, 2), 16)) + 0.7152 * channel(Number.parseInt(value.slice(2, 4), 16)) + 0.0722 * channel(Number.parseInt(value.slice(4, 6), 16));
}

export function contrastRatio(foreground: string, background: string): number {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * ¿Se justifica el cuerpo del procedimiento?
 *
 * React Native no parte palabras: al justificar, reparte el hueco sobrante entre
 * los espacios de la línea. Con el texto a tamaño normal apenas se nota, pero
 * cuando el sistema agranda la letra caben menos palabras por línea y esos huecos
 * se juntan formando ríos blancos que bajan por el párrafo. En una ficha clínica
 * que alguien lee con prisa, eso cuesta más de lo que aporta el borde recto.
 *
 * El umbral es 1.3 —el primer paso de Dynamic Type que estrecha la línea de
 * verdad— y por debajo se justifica.
 */
export function procedureTextAlign(fontScale: number): "justify" | "left" {
  return fontScale >= 1.3 ? "left" : "justify";
}
