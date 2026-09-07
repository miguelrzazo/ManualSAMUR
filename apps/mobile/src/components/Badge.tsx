import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { radii, spacing, typography, type AdaptivePalette } from "@manual-samur/design-tokens";
import { useTheme } from "../theme.tsx";

/**
 * La etiqueta pequeña y no pulsable: un identificador de hospital, un status, el
 * tipo de un cambio en el historial.
 *
 * Existe porque media docena de sitios la pintaban aplicando `borderRadius`
 * directamente sobre un `<Text>`. En React Native eso no redondea una caja: si la
 * etiqueta pasa a dos líneas, cada línea se redondea por su cuenta y la píldora
 * sale partida. Con `paddingVertical: 1` o `2`, que es lo que tenían, el texto
 * además tocaba el borde y se veía cortado por arriba y por abajo.
 *
 * Aquí el redondeo va en un `View`, el relleno vertical sale de la escala y el
 * texto no puede pasar de una línea. `maxFontSizeMultiplier` acota el crecimiento
 * con Dynamic Type: la fila que la contiene tiene altura fija y a partir de ahí
 * la píldora deja de caber, que es justo el corte que veníamos arrastrando.
 */
export function Badge({ label, tone = "neutral", color, background, style }: {
  label: string;
  /** `neutral` para un identificador; `accent` cuando el color lo da quien llama. */
  tone?: "neutral" | "accent";
  /** Color del texto. Solo se usa con `tone="accent"`. */
  color?: string;
  /** Fondo explícito. Prefiere un `*Wash` de la paleta: en oscuro contrasta mejor que un alpha del acento. */
  background?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);
  const accent = tone === "accent" ? color ?? palette.primary : undefined;

  return (
    <View style={[styles.badge, accent ? { backgroundColor: background ?? `${accent}22` } : undefined, style]}>
      <Text
        style={[styles.label, accent ? { color: accent } : undefined]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.4}
      >
        {label}
      </Text>
    </View>
  );
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(() => StyleSheet.create({
    badge: {
      alignSelf: "flex-start",
      // `radii.sm` en lugar del 6 a mano que usaban las cuatro insignias de código.
      borderRadius: radii.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: palette.surfaceMuted,
      // Android recorta el fondo en las esquinas sin esto.
      overflow: "hidden",
    },
    label: {
      ...typography.caption2,
      fontWeight: "600",
      color: palette.inkMuted,
      // Un identificador es casi siempre un número: sin esto la columna baila.
      fontVariant: ["tabular-nums"],
    },
  }), [palette]);
}
