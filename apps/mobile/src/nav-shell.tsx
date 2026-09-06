import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import React, { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing } from "@manual-samur/design-tokens";
import { accessibilityHints, accessibilityTargetStyle, routeAccessibilityLabels, type AdaptivePalette } from "./accessibility";
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
 * its default bar in JS, so it can never receive real Liquid Glass — this renders two
 * independent capsules instead: the four-destination tab pill and a detached search
 * button, laid out on the same line per the GitHub Copilot mobile reference. Both use
 * `GlassView` on iOS 26/27 when available and not overridden by Reduce Transparency;
 * every other path (Android, pre-iOS-26, Reduce Transparency on) gets a deliberate opaque
 * capsule using the existing palette, not a degraded glass imitation.
 *
 * Buscar is a real `Tabs.Screen` — a destination with its own recent searches and scope
 * chips, not the modal it used to be — but it is deliberately *not* drawn inside the pill.
 * `SEARCH_ROUTE` is split out of `state.routes` and rendered as the detached bubble, so
 * navigating to it, its selected state and its back behaviour are all ordinary tab
 * behaviour while the bar keeps the two-capsule shape.
 */
const SEARCH_ROUTE = "Buscar";
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

  const pillRoutes = state.routes.filter((route) => route.name !== SEARCH_ROUTE);
  const searchRoute = state.routes.find((route) => route.name === SEARCH_ROUTE);
  const searchFocused = searchRoute ? state.routes[state.index]?.key === searchRoute.key : false;

  const goTo = (route: { key: string; name: string }, focused: boolean) => {
    const event = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
    if (focused || event.defaultPrevented) return;
    // Both capsules are glass: at a glance the selected destination is a colour change on
    // a translucent surface, which is the weakest state cue in the app. The tick confirms
    // the tap landed even when the eye has not caught up.
    selectionTick();
    navigation.navigate(route.name);
  };

  const tabButtons = (
    <View style={styles.tabRow} accessibilityRole="tablist" accessibilityLabel="Navegación principal">
      {pillRoutes.map((route) => {
        const { options } = descriptors[route.key];
        const focused = state.routes[state.index]?.key === route.key;
        const label = typeof options.tabBarLabel === "string" ? options.tabBarLabel : route.name;
        const color = focused ? palette.primary : palette.inkMuted;
        return (
          <Pressable
            key={route.key}
            onPress={() => goTo(route, focused)}
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

  const searchButton = searchRoute ? (
    <Pressable
      onPress={() => goTo(searchRoute, searchFocused)}
      style={[styles.searchButton, accessibilityTargetStyle()]}
      accessibilityRole="tab"
      accessibilityLabel={routeAccessibilityLabels.Buscar}
      accessibilityHint={searchFocused ? undefined : accessibilityHints.search}
      accessibilityState={{ selected: searchFocused }}
    >
      <MaterialCommunityIcons name="magnify" size={24} color={searchFocused ? palette.primary : palette.ink} />
    </Pressable>
  ) : null;

  // The two capsules are deliberately NOT wrapped in a GlassContainer: that component
  // exists to let neighbouring glass elements merge, and it drew a visible bridge
  // between the tab bar and the search button even at spacing 0. They are separate
  // controls and must read as separate objects.
  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      {glassReady ? (
        <View style={styles.row}>
          <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme === "dark" ? "dark" : "light"} style={styles.tabCapsule}>
            {tabButtons}
          </GlassView>
          {searchButton && (
            <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme === "dark" ? "dark" : "light"} style={styles.searchCapsule}>
              {searchButton}
            </GlassView>
          )}
        </View>
      ) : (
        <View style={styles.row}>
          <View style={[styles.tabCapsule, fallbackCapsule, styles.fallbackShadow]}>{tabButtons}</View>
          {searchButton && <View style={[styles.searchCapsule, fallbackCapsule, styles.fallbackShadow]}>{searchButton}</View>}
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
  searchCapsule: { borderRadius: radii.pill, width: 56, height: 56, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  searchButton: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  tabItemLabel: { fontSize: 11, fontWeight: "500" },
  fallbackShadow: Platform.select({
    ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 4 },
    default: {},
  }) as object,
});
