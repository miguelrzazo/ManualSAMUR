/**
 * Which navigator's focused route Handoff advertises. Pure logic only — no React Native
 * imports — so it can be tested under plain Node.
 *
 * On a narrow window everything happens on the root stack. On a wide one (iPad, an open
 * iPhone Duo) a split tab draws its detail in a pane that runs its own, independent
 * NavigationContainer, which the root navigator cannot see: the root only knows that
 * "Inicio" is focused, not that procedure 301 is open beside the list. The visible pane
 * claims the Handoff slot here while it shows a detail and releases it when it empties,
 * loses focus or unmounts, which hands the slot back to the root route.
 */
import type { FocusedRoute } from "./web-route-mapping.ts";

export interface PaneRouteClaim {
  /** Publishes the pane's focused route, or `undefined` while its tree is not ready. */
  update(route: FocusedRoute | undefined): void;
  /** Gives the slot back. A no-op once a newer claim has replaced this one. */
  release(): void;
}

export interface HandoffRouteSource {
  /** The pane route that overrides the root one, if a visible pane holds the slot. */
  paneRoute(): FocusedRoute | undefined;
  /** Picks the route to advertise: the pane's while it holds the slot, else the root's. */
  resolve(rootRoute: FocusedRoute | undefined): FocusedRoute | undefined;
  claim(): PaneRouteClaim;
  /** Called whenever the advertised pane route changes. Returns an unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export function createHandoffRouteSource(): HandoffRouteSource {
  // The newest claim wins: a new selection remounts the pane, and React may mount the
  // new tree before the old one's cleanup runs. A stale release must not clear it.
  let owner: object | null = null;
  let route: FocusedRoute | undefined;
  const listeners = new Set<() => void>();
  const emit = () => { for (const listener of listeners) listener(); };

  return {
    paneRoute: () => (owner ? route : undefined),
    resolve(rootRoute) {
      return (owner && route) ? route : rootRoute;
    },
    claim() {
      const token = {};
      owner = token;
      route = undefined;
      return {
        update(next) {
          if (owner !== token) return;
          if (sameRoute(route, next)) return;
          route = next;
          emit();
        },
        release() {
          if (owner !== token) return;
          owner = null;
          route = undefined;
          emit();
        },
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}

function sameRoute(a: FocusedRoute | undefined, b: FocusedRoute | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.name === b.name && JSON.stringify(a.params ?? null) === JSON.stringify(b.params ?? null);
}

/** The one source the root bridge and every detail pane share. */
export const handoffRouteSource = createHandoffRouteSource();
