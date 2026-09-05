import type { ColorSchemeName } from "react-native";

export type MobileRoute = "Inicio" | "Codigos" | "VademecumList" | "Mapa" | "Buscar" | "Guardados" | "Procedimiento" | "Vademécum" | "Fármaco" | "Código" | "Ubicación" | "Ajustes";

/** Stable spoken names used by Voice Control and route-level accessibility checks. */
export const routeAccessibilityLabels: Record<MobileRoute, string> = {
  Inicio: "Inicio",
  Codigos: "Códigos",
  VademecumList: "Vademécum",
  Mapa: "Mapa offline",
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

/** Text colors deliberately stay dark enough on both the light and dark surfaces. */
export const adaptivePalette = {
  light: {
    paper: "#F7F8FA",
    surface: "#FFFFFF",
    surfaceMuted: "#EEF1F5",
    ink: "#13233D",
    inkMuted: "#52627A",
    line: "#C9D2DE",
    red: "#B51F2A",
    redDark: "#8E1720",
    redAction: "#B51F2A",
    redWash: "#FCEBED",
    amber: "#8A5200",
    amberWash: "#FFF1D6",
    green: "#12633F",
    greenWash: "#E4F3EB",
    white: "#FFFFFF",
    black: "#000000",
  },
  dark: {
    paper: "#101827",
    surface: "#172235",
    surfaceMuted: "#223149",
    ink: "#F5F7FB",
    inkMuted: "#C1CCDC",
    line: "#46556B",
    red: "#FF8A91",
    redDark: "#FFB4B8",
    redAction: "#9D1A25",
    redWash: "#4A202B",
    amber: "#FFD18A",
    amberWash: "#49391F",
    green: "#7BE2B0",
    greenWash: "#1D4032",
    white: "#FFFFFF",
    black: "#000000",
  },
} as const;

export type AdaptivePalette = (typeof adaptivePalette)[keyof typeof adaptivePalette];

export function resolveAdaptivePalette(scheme: ColorSchemeName): AdaptivePalette {
  return scheme === "dark" ? adaptivePalette.dark : adaptivePalette.light;
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
