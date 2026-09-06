import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import { Animated, Pressable, StyleSheet } from "react-native";
import { motion, type AdaptivePalette } from "@manual-samur/design-tokens";
import { accessibilityTargetStyle } from "../accessibility.ts";
import { lightImpact } from "../hooks/haptics.ts";
import { useReduceMotion } from "../hooks/motion.ts";
import { BACK_TO_TOP_PLACEMENT } from "../scroll-chrome-logic.ts";
import { useTheme } from "../theme.tsx";

/**
 * "Volver arriba", shared by every long scrolling surface.
 *
 * It used to be an inline `{showBackToTop && <Pressable …>}` in `CodigosScreen`:
 * the control simply existed or did not, appearing and vanishing between two
 * frames, and the scroll it triggered was the only motion in the interaction.
 * Here it is always mounted and animates itself in and out — opacity, a small
 * rise and a scale from 0.8 — so the eye can follow where it came from. Hidden
 * means `pointerEvents="none"`, not unmounted, because a fully transparent
 * button that still takes touches is worse than no button at all.
 *
 * Placement comes from `BACK_TO_TOP_PLACEMENT` rather than from a local style,
 * because it is a constraint and not a preference: `nav-shell.tsx` draws the
 * floating Search capsule bottom-right, and an earlier bottom-right version of
 * this button landed on top of it — "Volver arriba" opened Search instead.
 * `backToTopOverlapsSearchCapsule` keeps that honest in `tests/`.
 */
export function BackToTop({ visible, onPress, bottom, label = "Volver arriba" }: {
  visible: boolean;
  onPress: () => void;
  /** Override for a surface with no tab bar underneath it, e.g. the procedure reader. */
  bottom?: number;
  label?: string;
}) {
  const palette = useTheme();
  const styles = useStyles(palette);
  const reduceMotion = useReduceMotion();
  // Lazy state rather than a ref: the value is read during render (the styles
  // below interpolate it), which is precisely what a ref may not be used for.
  const [progress] = useState(() => new Animated.Value(visible ? 1 : 0));

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? motion.base : motion.fast,
      useNativeDriver: true,
    }).start();
  }, [progress, visible]);

  // Under Reduce Motion the control still fades — it must not appear out of
  // nowhere — but it does not travel or scale.
  const transform = useMemo(
    () =>
      reduceMotion
        ? undefined
        : [
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) },
          ],
    [progress, reduceMotion],
  );

  return (
    <Animated.View
      pointerEvents={visible ? "auto" : "none"}
      style={[styles.container, bottom === undefined ? null : { bottom }, { opacity: progress }, transform ? { transform } : null]}
    >
      <Pressable
        onPress={() => {
          lightImpact();
          onPress();
        }}
        style={[styles.button, accessibilityTargetStyle()]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Vuelve al principio de la lista y muestra de nuevo la cabecera."
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? "yes" : "no-hide-descendants"}
      >
        <MaterialCommunityIcons name="arrow-up" size={20} color={palette.paper} />
      </Pressable>
    </Animated.View>
  );
}

function useStyles(palette: AdaptivePalette) {
  return React.useMemo(
    () =>
      StyleSheet.create({
        container: {
          position: "absolute",
          left: BACK_TO_TOP_PLACEMENT.left,
          bottom: BACK_TO_TOP_PLACEMENT.bottom,
        },
        button: {
          width: BACK_TO_TOP_PLACEMENT.size,
          height: BACK_TO_TOP_PLACEMENT.size,
          borderRadius: BACK_TO_TOP_PLACEMENT.size / 2,
          backgroundColor: palette.ink,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: palette.black,
          shadowOpacity: 0.18,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        },
      }),
    [palette],
  );
}
