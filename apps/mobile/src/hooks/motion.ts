import { useEffect, useState } from "react";
import { AccessibilityInfo, LayoutAnimation, Platform, UIManager } from "react-native";
import { motion } from "@manual-samur/design-tokens";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Shared with the rest of the app so that every animated surface asks the same
 * question. Previously this lived inside `App.tsx` and only gated the stack
 * transition and modal `animationType`; the components under `src/components/`
 * need it too.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceMotion;
}

/**
 * Queue a layout transition for the next commit. A no-op when Reduce Motion is
 * on, so callers can invoke it unconditionally before a `setState`.
 */
export function animateNextLayout(reduceMotion: boolean, duration: number = motion.fast) {
  if (reduceMotion) return;
  LayoutAnimation.configureNext({
    duration,
    create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeOut },
    delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  });
}
