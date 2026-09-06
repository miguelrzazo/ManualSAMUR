import React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { TAB_BAR_INSET } from "@manual-samur/design-tokens";
import { useTheme } from "../theme.tsx";

/**
 * Tab-screen shell.
 *
 * The floating glass capsules overlay the content instead of pushing it up, so
 * every scrolling surface has to reserve room beneath itself. Six screens each
 * guessed at that number independently — 116, 140, 140, 140, 132 and 100 — which
 * is why the last row of Inicio, Vademécum and Mapa sat behind translucent glass.
 * `contentInset` is the one answer, exported from the tokens package.
 */
export function Screen({ children, edges = ["top"] }: {
  children: React.ReactNode;
  edges?: ReadonlyArray<"top" | "bottom" | "left" | "right">;
}) {
  const palette = useTheme();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.paper }]} edges={edges}>
      {children}
    </SafeAreaView>
  );
}

/** Spread into any `contentContainerStyle` that scrolls under the tab capsules. */
export const contentInset = { paddingBottom: TAB_BAR_INSET } as const;

/** Groups rows into an inset card, the way a grouped list reads on iOS. */
export function ListGroup({ children }: { children: React.ReactNode }) {
  const palette = useTheme();
  return <View style={[styles.group, { backgroundColor: palette.surface }]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  group: { borderRadius: 12, overflow: "hidden" },
});
