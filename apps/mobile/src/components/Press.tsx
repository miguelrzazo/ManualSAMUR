import React, { forwardRef, useRef, useState } from "react";
import { Animated, Pressable as NativePressable, type PressableProps, type StyleProp, type View, type ViewStyle } from "react-native";
import { motion } from "@manual-samur/design-tokens";
import { accessibilityTargetStyle } from "../accessibility.ts";
import { useReduceMotion } from "../hooks/motion.ts";

const MIN_TARGET = accessibilityTargetStyle();

/**
 * `Pressable` is animated directly rather than wrapped in an `Animated.View`,
 * so this drops into existing layouts without introducing a node that swallows
 * `flex: 1` from its parent row.
 *
 * Note the `style` type: an array or object, never `Pressable`'s function form.
 * `createAnimatedComponent` flattens whatever it is handed, and a function
 * flattens to nothing — every style on the element is silently dropped and it
 * falls back to default column layout. The pressed state is tracked here instead
 * so callers never need the function form.
 */
const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);

/**
 * Every interactive element in the app, with the two things the old inline
 * `Pressable`s kept forgetting:
 *
 *  - a 44pt minimum target, including icon-only controls;
 *  - press feedback that is actually visible. The previous flat `opacity: 0.72`
 *    was applied on maybe a third of the app's pressables and not at all in
 *    Códigos, Vademécum or Mapa, so most of the app registered a tap with no
 *    acknowledgement whatsoever.
 *
 * The scale is `0.96` — below `0.95` reads as exaggerated — and runs on the
 * native driver so it survives a busy JS thread. Under Reduce Motion the scale
 * is skipped and an opacity change carries the feedback instead, because press
 * feedback must never disappear entirely.
 */
export type PressProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** Opt out where the surrounding surface already animates, e.g. a map pin. */
  noScale?: boolean;
};

export const Press = forwardRef<View, PressProps>(function Press({ style, noScale = false, onPressIn, onPressOut, ...props }, ref) {
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const [pressed, setPressed] = useState(false);
  const animate = !noScale && !reduceMotion;

  return (
    <AnimatedPressable
      ref={ref}
      {...props}
      onPressIn={(event) => {
        if (animate) {
          Animated.timing(scale, { toValue: motion.pressScale, duration: motion.instant, useNativeDriver: true }).start();
        } else {
          setPressed(true);
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (animate) {
          Animated.timing(scale, { toValue: 1, duration: motion.fast, useNativeDriver: true }).start();
        } else {
          setPressed(false);
        }
        onPressOut?.(event);
      }}
      style={[
        style,
        MIN_TARGET,
        animate ? { transform: [{ scale }] } : pressed ? { opacity: 0.72 } : null,
      ]}
    />
  );
});
