import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { GlassContainer, GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import React, { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, routeAccessibilityLabels, type AdaptivePalette } from "./accessibility";

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
  onOpenSearch: () => void;
};

/**
 * Custom `tabBar` for the bottom Tab.Navigator. `@react-navigation/bottom-tabs` v7 draws
 * its default bar in JS, so it can never receive real Liquid Glass — this renders two
 * independent capsules instead: the four-destination tab pill and a detached search
 * button, laid out on the same line per the GitHub Copilot mobile reference. Both use
 * `GlassView`/`GlassContainer` on iOS 26/27 when available and not overridden by Reduce
 * Transparency; every other path (Android, pre-iOS-26, Reduce Transparency on) gets a
 * deliberate opaque capsule using the existing palette, not a degraded glass imitation.
 */
export function GlassTabBar({ state, descriptors, navigation, palette, onOpenSearch }: GlassTabBarProps) {
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
        const color = focused ? palette.red : palette.inkMuted;
        const onPress = () => {
          const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
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
            <Text style={[styles.tabItemLabel, { color }]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const searchButton = (
    <Pressable
      onPress={onOpenSearch}
      style={[styles.searchButton, accessibilityTargetStyle()]}
      accessibilityRole="search"
      accessibilityLabel={routeAccessibilityLabels.Buscar}
      accessibilityHint={accessibilityHints.search}
    >
      <MaterialCommunityIcons name="magnify" size={24} color={palette.ink} />
    </Pressable>
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {glassReady ? (
        <GlassContainer spacing={16} style={styles.row}>
          <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme === "dark" ? "dark" : "light"} style={styles.tabCapsule}>
            {tabButtons}
          </GlassView>
          <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme === "dark" ? "dark" : "light"} style={styles.searchCapsule}>
            {searchButton}
          </GlassView>
        </GlassContainer>
      ) : (
        <View style={styles.row}>
          <View style={[styles.tabCapsule, fallbackCapsule, styles.fallbackShadow]}>{tabButtons}</View>
          <View style={[styles.searchCapsule, fallbackCapsule, styles.fallbackShadow]}>{searchButton}</View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: spacing.xl },
  tabCapsule: { flex: 1, borderRadius: radii.pill, overflow: "hidden" },
  tabRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 2 },
  tabItemLabel: { fontSize: 10, fontWeight: "700" },
  searchCapsule: { borderRadius: radii.pill, width: 56, height: 56, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  searchButton: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  fallbackShadow: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 4 },
    default: {},
  }) as object,
});
