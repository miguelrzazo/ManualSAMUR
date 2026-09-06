import React, { createContext, useContext, useMemo } from "react";
import { StyleSheet, useColorScheme } from "react-native";
import { adaptivePalette, type AdaptivePalette } from "@manual-samur/design-tokens";
import { usePreferences } from "./preferences";

/**
 * One theme, reached through a hook.
 *
 * This replaces three separate mechanisms that all resolved the same colours:
 * the module-level `let activePalette` in `App.tsx`, reassigned *during render*
 * and read by components that had no way to re-render when it changed; a
 * `DynamicColorIOS` `nativeTheme` applied to about ten styles and ignored by the
 * rest; and four verbatim copies of `useActivePalette` in the screen modules.
 *
 * The mutation had a visible cost: because the palette was not reactive,
 * `AppGate` had to remount the entire navigator with
 * `<AppNavigation key={appearance-scheme} />` on every theme change, throwing
 * away the navigation stack. With a context the tree just re-renders.
 */

const ThemeContext = createContext<AdaptivePalette>(adaptivePalette.light);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { appearance } = usePreferences();
  const scheme = useColorScheme();
  const resolved = appearance === "system" ? scheme : appearance;
  const palette = resolved === "dark" ? adaptivePalette.dark : adaptivePalette.light;
  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AdaptivePalette {
  return useContext(ThemeContext);
}

export function useIsDark(): boolean {
  return useTheme() === adaptivePalette.dark;
}

/**
 * Memoised `StyleSheet.create` keyed on the palette. Screens previously each
 * declared their own `createStyles(palette)` plus a `useMemo` to call it; this
 * is that pattern written once.
 */
export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: (palette: AdaptivePalette) => T): T {
  const palette = useTheme();
  return useMemo(() => StyleSheet.create(factory(palette)), [palette, factory]);
}
