import { createNavigationContainerRef } from "@react-navigation/native";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useWindowDimensions } from "react-native";
import { adaptiveLayout, type AdaptiveLayout } from "./accessibility.ts";
import type { RootStackParamList } from "./navigation-types.ts";
import type { DetailRoute, SplitSection, SplitSelections } from "./split-view-logic.ts";

/**
 * The root navigator, reachable from outside React Navigation's tree: App Intents, the
 * size-change bridge, and a detail pane (which runs its own independent container) all
 * need to reach the root stack.
 */
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Same `adaptiveLayout` policy everywhere, so the rail and the panes never disagree. */
export function useAdaptiveLayout(): AdaptiveLayout {
  const { width, fontScale } = useWindowDimensions();
  return useMemo(() => adaptiveLayout(width, fontScale), [width, fontScale]);
}

interface SplitSelectionValue {
  selections: SplitSelections;
  select: (section: SplitSection, detail: DetailRoute | undefined) => void;
}

const SplitSelectionContext = createContext<SplitSelectionValue>({ selections: {}, select: () => undefined });

/**
 * Selections live above the navigator, not in a screen's state, so they survive a
 * rotation, a Split View resize or folding an iPhone Duo — all of which only resize the
 * window and swap the presentation underneath.
 */
export function SplitSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selections, setSelections] = useState<SplitSelections>({});
  const select = useCallback((section: SplitSection, detail: DetailRoute | undefined) => {
    setSelections((previous) => {
      if (previous[section] === detail) return previous;
      const next = { ...previous };
      if (detail) next[section] = detail; else delete next[section];
      return next;
    });
  }, []);
  const value = useMemo(() => ({ selections, select }), [selections, select]);
  return <SplitSelectionContext.Provider value={value}>{children}</SplitSelectionContext.Provider>;
}

export function useSplitSelections(): SplitSelectionValue {
  return useContext(SplitSelectionContext);
}

/**
 * How a split tab opens a row. Wide: the detail pane shows it. Narrow: it is pushed on
 * the root stack, exactly as before — and remembered, so widening the window later
 * moves it into the pane rather than losing it.
 */
export function useOpenDetail(section: SplitSection): (detail: DetailRoute) => void {
  const { isTwoPane } = useAdaptiveLayout();
  const { select } = useSplitSelections();
  return useCallback((detail: DetailRoute) => {
    select(section, detail);
    if (isTwoPane || !navigationRef.isReady()) return;
    // The union is correlated (screen ↔ params) but TypeScript cannot narrow a
    // spread of it into `navigate`'s overloads.
    (navigationRef.navigate as (screen: string, params?: object) => void)(detail.screen, detail.params);
  }, [isTwoPane, section, select]);
}

/** True inside a detail pane: the reader hides its own floating tab capsule there. */
export const InDetailPaneContext = createContext(false);
