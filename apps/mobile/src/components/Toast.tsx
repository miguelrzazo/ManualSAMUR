import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet, Text } from "react-native";
import { motion, radii, spacing, TAB_BAR_INSET, type AdaptivePalette } from "@manual-samur/design-tokens";
import { useReduceMotion } from "../hooks/motion.ts";
import { useTheme } from "../theme.tsx";

export type ToastTone = "warning" | "error";

const TONE_ICON: Record<ToastTone, keyof typeof MaterialCommunityIcons.glyphMap> = {
  warning: "alert",
  error: "alert-circle",
};

export interface ToastProps {
  message: string;
  tone: ToastTone;
  onDismiss: () => void;
  /** Milliseconds before the toast auto-dismisses itself. */
  duration?: number;
}

/**
 * Aviso transitorio, tocable para cerrarlo antes de tiempo.
 *
 * En la app no hay `Alert.alert` ni ningún patrón de snackbar: el resto de la
 * interfaz usa un banner de tinte fijo y permanente (`palette.dangerWash` /
 * `amberWash`, `radii.md`, fila con icono + texto). Este componente toma
 * exactamente ese lenguaje visual pero se retira solo, para el único caso que
 * necesita interrumpir un instante sin quedarse anclado en la pantalla —
 * como el aviso de "estás fuera de Madrid" del mapa.
 *
 * Se monta y desmonta bajo control del padre (`{message && <Toast .../>}`),
 * así que el temporizador vive y muere con esa instancia: no hay fuga posible.
 */
export function Toast({ message, tone, onDismiss, duration = 5000 }: ToastProps) {
  const palette = useTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const reduceMotion = useReduceMotion();
  // Lazy state rather than a ref, matching `BackToTop`: the value is read during
  // render (the styles below interpolate it), which a ref may not be used for.
  const [opacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
    // `message` entra en las dependencias a proposito: si el padre reutiliza la
    // misma instancia para un aviso distinto, el temporizador tiene que empezar de
    // cero, o el segundo mensaje heredaria lo que le quedase al primero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duration, message]);

  useEffect(() => {
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: motion.fast, useNativeDriver: true }).start();
  }, [opacity, reduceMotion]);

  const iconColor = tone === "error" ? palette.danger : palette.amber;
  const backgroundColor = tone === "error" ? palette.dangerWash : palette.amberWash;

  return (
    <Animated.View style={[styles.container, { opacity }]} pointerEvents="box-none">
      <Pressable
        onPress={onDismiss}
        style={[styles.banner, { backgroundColor }]}
        accessibilityRole="button"
        accessibilityLiveRegion="polite"
        accessibilityLabel={message}
        accessibilityHint="Toca para cerrar este aviso."
      >
        <MaterialCommunityIcons name={TONE_ICON[tone]} size={18} color={iconColor} />
        <Text style={styles.text}>{message}</Text>
      </Pressable>
    </Animated.View>
  );
}

function createStyles(palette: AdaptivePalette) {
  return StyleSheet.create({
    // Por encima de TAB_BAR_INSET, igual que trailingControls / onlineMapAttribution
    // en MapaScreen: nunca debe quedar tapado por la píldora flotante de pestañas.
    container: {
      position: "absolute",
      left: spacing.lg,
      right: spacing.lg,
      bottom: TAB_BAR_INSET + spacing.lg,
    },
    banner: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: spacing.sm,
      borderRadius: radii.md,
      padding: spacing.md,
    },
    text: {
      flex: 1,
      color: palette.ink,
      fontSize: 12,
      lineHeight: 17,
    },
  });
}
