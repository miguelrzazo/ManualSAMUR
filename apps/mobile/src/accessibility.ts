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
  Ajustes: "Información y ajustes",
};

export const accessibilityHints = {
  openDetail: "Abre la ficha para consultar su contenido.",
  toggleFavorite: "Cambia si esta referencia aparece en Guardados.",
  openMap: "Abre el punto en la aplicación Mapas del dispositivo.",
  dismiss: "Cierra esta pantalla y devuelve el foco al elemento que la abrió.",
  search: "Escribe términos, identificadores o texto del manual.",
  switchTab: "Cambia a esta sección de la navegación principal.",
} as const;

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
  isTablet: boolean;
  singleColumn: boolean;
  listMaxWidth: number;
  readingMaxWidth: number;
}

/** Deterministic same-IA layout policy for phones, tablets, and large text. */
export function adaptiveLayout(width: number, fontScale: number): AdaptiveLayout {
  const isTablet = width >= 768;
  const singleColumn = width < 420 || fontScale >= 1.75;
  return {
    isTablet,
    singleColumn,
    listMaxWidth: isTablet ? 1040 : width,
    readingMaxWidth: isTablet ? 720 : width,
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
