import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from "expo-glass-effect";
import React, { useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle, useColorScheme } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radii, spacing, typography } from "@manual-samur/design-tokens";
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

/** Whether this device can draw real Liquid Glass right now, accessibility settings included. */
export function useGlassReady(): boolean {
  const reduceTransparency = useReduceTransparency();
  return useMemo(() => {
    try {
      return isGlassEffectAPIAvailable() && isLiquidGlassAvailable() && !reduceTransparency;
    } catch {
      return false;
    }
  }, [reduceTransparency]);
}

/**
 * One floating capsule: real glass where the platform has it, an honest opaque
 * surface everywhere else.
 *
 * Exported because the procedure reader draws the same two capsules without a
 * `Tab.Navigator` behind it (see `components/ReaderNavBar.tsx`). Having that
 * screen re-implement the availability checks is how the app would end up with
 * two different definitions of "is glass available", drifting apart the first
 * time one of them is fixed.
 */
export function GlassCapsule({ style, children, palette }: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  palette: AdaptivePalette;
}) {
  const scheme = useColorScheme();
  const glassReady = useGlassReady();
  if (glassReady) {
    return (
      <GlassView glassEffectStyle="regular" isInteractive colorScheme={scheme === "dark" ? "dark" : "light"} style={style}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, { backgroundColor: palette.surface, borderColor: palette.line, borderWidth: StyleSheet.hairlineWidth }, fallbackShadow]}>
      {children}
    </View>
  );
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
        // `state.routes` and `descriptors` are two separate props and are not guaranteed to
        // agree mid-transition: a route can be in the array a frame before its descriptor
        // is built. Destructuring `descriptors[route.key]` blind threw "Cannot destructure
        // property 'options' of undefined" and took the whole app down with it, which is
        // the only way a tab bar can crash on a tap it never handled.
        const descriptor = descriptors[route.key];
        if (!descriptor) return null;
        const { options } = descriptor;
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
            {options.tabBarIcon?.({ focused, color, size: TAB_ICON_SIZE })}
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
      <View style={styles.row}>
        <GlassCapsule palette={palette} style={styles.tabCapsule}>{tabButtons}</GlassCapsule>
        {searchButton && <GlassCapsule palette={palette} style={styles.searchCapsule}>{searchButton}</GlassCapsule>}
      </View>
    </View>
  );
}

/**
 * 26pt, not 23.
 *
 * The bar measured ~58pt against a system tab bar's 64–68 and read as a scaled-down
 * copy of one. The icon carries most of that: at 23 it sat in the middle of the
 * capsule with air on every side and nothing to anchor the label to.
 */
export const TAB_ICON_SIZE = 26;

const fallbackShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
  android: { elevation: 4 },
  default: {},
}) as ViewStyle;

const styles = StyleSheet.create({
  wrapper: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", columnGap: spacing.xl },
  tabCapsule: { flex: 1, borderRadius: radii.pill, overflow: "hidden" },
  tabRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  // `minHeight: 48` on the item, `spacing.sm` above and below the row: 64pt of capsule,
  // which is the height a system tab bar actually has. The old 44 came from
  // `accessibilityTargetStyle()` alone — a floor for reachability, never a size.
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, gap: 2, paddingVertical: 2 },
  searchCapsule: { borderRadius: radii.pill, width: 56, height: 56, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  searchButton: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  tabItemLabel: { ...typography.caption2, fontWeight: "500" },
});
