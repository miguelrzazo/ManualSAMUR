/**
 * List/detail split for Manual, Vademécum and Códigos on wide windows (iPad, an open
 * iPhone Duo). Pure logic only — no React Native imports — so the size-change rules can
 * be tested under plain Node.
 *
 * The model mirrors `UISplitViewController`: each split tab remembers one selected
 * detail. Wide, that detail is drawn beside the list. Narrow, opening a row pushes the
 * same detail onto the root stack. When the window changes size the selection survives
 * and is moved between the two presentations:
 *
 * - wide → narrow (collapse): the visible detail is pushed, so the reader stays on it;
 * - narrow → wide (expand): a detail that was pushed from that tab's list is popped and
 *   shown in the detail pane instead, beside the list it came from.
 */
import type { RootStackParamList, TabsParamList } from "./navigation-types.ts";

/** Tabs that become a list + detail split on wide windows. */
export const SPLIT_SECTIONS = ["Inicio", "Codigos", "VademecumList"] as const satisfies readonly (keyof TabsParamList)[];
export type SplitSection = (typeof SPLIT_SECTIONS)[number];

/** Detail screens that can live in the right-hand pane. */
export const PANE_SCREENS = ["Procedure", "Drug", "Vademecum", "Code", "Location", "Status4", "Anexo"] as const satisfies readonly (keyof RootStackParamList)[];
export type PaneScreen = (typeof PANE_SCREENS)[number];

export type DetailRoute = {
  [K in PaneScreen]: { screen: K; params: RootStackParamList[K] };
}[PaneScreen];

export type SplitSelections = Partial<Record<SplitSection, DetailRoute>>;

export function isSplitSection(name: string | undefined): name is SplitSection {
  return (SPLIT_SECTIONS as readonly string[]).includes(name ?? "");
}

export function isPaneScreen(name: string | undefined): name is PaneScreen {
  return (PANE_SCREENS as readonly string[]).includes(name ?? "");
}

/** Stable identity for a detail; also the key that remounts the pane on a new selection. */
export function detailRouteKey(route: DetailRoute): string {
  return `${route.screen}:${JSON.stringify(route.params ?? null)}`;
}

/** Does a root-stack route show exactly this detail? */
export function routeShowsDetail(route: { name: string; params?: object }, detail: DetailRoute): boolean {
  return route.name === detail.screen && JSON.stringify(route.params ?? null) === JSON.stringify(detail.params ?? null);
}

/** Minimal shape of the navigation state this module reads. */
export interface RootStackSnapshot {
  index: number;
  routes: { name: string; params?: object; state?: { index?: number; routes: { name: string }[] } }[];
}

/** The focused tab, or undefined when the tab navigator has not rendered yet. */
export function focusedTab(state: RootStackSnapshot | undefined): string | undefined {
  const tabs = state?.routes[0];
  if (!tabs || tabs.name !== "Tabs") return undefined;
  const tabState = tabs.state;
  if (!tabState) return "Inicio";
  return tabState.routes[tabState.index ?? 0]?.name;
}

export type SizeTransition =
  | { kind: "none" }
  | { kind: "push"; detail: DetailRoute }
  | { kind: "popToTop" };

/**
 * What the root stack must do when the window crosses the two-pane breakpoint.
 *
 * Only the simple, unambiguous cases move anything: a collapse pushes the selection
 * when the list is on top, and an expand pops a single pushed detail that matches the
 * tab's selection. Anything deeper (a procedure opened from another procedure, a detail
 * reached from Buscar) is left where the user put it.
 */
export function planSizeTransition(input: {
  wasTwoPane: boolean;
  isTwoPane: boolean;
  state: RootStackSnapshot | undefined;
  selections: SplitSelections;
}): SizeTransition {
  const { wasTwoPane, isTwoPane, state, selections } = input;
  if (wasTwoPane === isTwoPane || !state) return { kind: "none" };
  const tab = focusedTab(state);
  if (!isSplitSection(tab)) return { kind: "none" };
  const selection = selections[tab];
  if (!selection) return { kind: "none" };
  if (wasTwoPane && !isTwoPane) {
    return state.index === 0 ? { kind: "push", detail: selection } : { kind: "none" };
  }
  if (state.routes.length === 2 && state.index === 1 && routeShowsDetail(state.routes[1]!, selection)) {
    return { kind: "popToTop" };
  }
  return { kind: "none" };
}

/**
 * Narrow only: the user went back from a pushed detail to the list. Returns the tab
 * whose selection should be forgotten, so a later rotation to wide does not resurrect
 * something the user has already closed.
 */
export function sectionToDeselect(input: {
  isTwoPane: boolean;
  previousIndex: number;
  state: RootStackSnapshot | undefined;
}): SplitSection | undefined {
  const { isTwoPane, previousIndex, state } = input;
  if (isTwoPane || !state || state.index !== 0 || previousIndex === 0) return undefined;
  const tab = focusedTab(state);
  return isSplitSection(tab) ? tab : undefined;
}
