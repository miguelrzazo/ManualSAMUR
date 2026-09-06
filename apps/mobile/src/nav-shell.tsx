import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import React, { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, type AdaptivePalette } from "./accessibility";
import { selectionTick } from "./hooks/haptics";

/**
 * Mirrors `useReduceMotion` in App.tsx (the app's established pattern for honouring a
 * system accessibility toggle via AccessibilityInfo), applied here to transparency.
 * `isLiquidGlassAvailable()` only reports component availability — it can be `true`
 * even when the user has limited the effect via accessibility settings, so this hook
 * is a mandatory second gate before rendering real glass.
 */
export function useReduceTransparency(): boolean {
  const [reduceTransparency, setReduceTransparency] = useState(false);
  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => { if (mounted) setReduceTransparency(enabled); })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setReduceTransparency);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);
  return reduceTransparency;
}

type GlassTabBarProps = BottomTabBarProps & {
  palette: AdaptivePalette;
};

/**
 * Custom `tabBar` for the bottom Tab.Navigator. `@react-navigation/bottom-tabs` v7 draws
 * its default bar in JS, so it can never receive real Liquid Glass — this renders the tab
 * pill itself, using `GlassView` on iOS 26/27 when available and not overridden by Reduce
 * Transparency; every other path (Android, pre-iOS-26, Reduce Transparency on) gets a
 * deliberate opaque capsule using the existing palette, not a degraded glass imitation.
 *
 * There used to be a second, detached capsule here holding a search button, because
 * Buscar was a modal rather than a destination. Buscar is the fifth tab now, so the
 * search icon lives in the pill with everything else and the capsule is gone.
 */
export function GlassTabBar({ state, descriptors, navigation, palette }: GlassTabBarProps) {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const reduceTransparency = useReduceTransparency();

  const glassReady = useMemo(() => {
    try {
      return isGlassEffectAPIAvailable() && isLiquidGlassAvailable() && !reduceTransparency;
    } catch {
      return false;
    }
  }, [reduceTransparency]);

  const fallbackCapsule = { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: StyleSheet.hairlineWidth };

  const tabButtons = (
    <View style={styles.tabRow} accessibilityRole="tablist" accessibilityLabel="Navegación principal">
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : route.name;
        const color = focused ? palette.primary : palette.inkMuted;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (focused || event.defaultPrevented) return;
          // The tab pill is glass: at a glance the selected tab is a colour change
          // on a translucent surface, which is the weakest state cue in the app.
          // The tick confirms the tap landed even when the eye has not caught up.
          selectionTick();
          navigation.navigate(route.name);
        };
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={[styles.tabItem, accessibilityTargetStyle()]}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityHint={focused ? undefined : accessibilityHints.switchTab}
            accessibilityState={{ selected: focused }}
          >
            {options.tabBarIcon?.({ focused, color, size: 23 })}
            <Text style={[styles.tabItemLabel, { color }]} numberOfLines={1} maxFontSizeMultiplier={1.4}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {glassReady ? (
        <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme === "dark" ? "dark" : "light"} style={styles.tabCapsule}>
          {tabButtons}
        </GlassView>
      ) : (
        <View style={[styles.tabCapsule, fallbackCapsule, styles.fallbackShadow]}>{tabButtons}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  tabCapsule: { flex: 1, borderRadius: radii.pill, overflow: "hidden" },
  tabRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 2, paddingHorizontal: 2 },
  tabItemLabel: { fontSize: 11, fontWeight: "500" },
  fallbackShadow: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 4 },
    default: {},
  }) as object,
});
