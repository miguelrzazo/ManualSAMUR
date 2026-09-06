/**
 * Pure logic for the collapsing header + back-to-top behaviour shared by the
 * three list destinations (Códigos, Vademécum, Buscar) and the procedure reader.
 *
 * Kept free of React Native imports so it runs under plain Node in `tests/`,
 * the same arrangement `codigos-logic.ts` and `vademecum-logic.ts` use.
 *
 * The collapse is driven by scroll *direction*, not by absolute position. A
 * position rule ("collapsed above 120pt") fights pull-to-refresh and rubber
 * banding: the header flickers as the list settles, and on a bounce the chrome
 * disappears while the user is pulling *down*. Tracking an anchor that follows
 * every direction flip means a reversal always has to travel a real distance
 * before anything moves.
 */

import { spacing, TAB_BAR_INSET } from "@manual-samur/design-tokens";

export interface ScrollChromeState {
  /** Chrome above the list (title, search, tabs, pill rows) is hidden. */
  collapsed: boolean;
  /** The back-to-top control is offered. */
  showBackToTop: boolean;
  /** Offset the last direction flip happened at; travel is measured from here. */
  anchorY: number;
}

/** Above this offset the chrome is always shown — the top of a list is never collapsed. */
export const COLLAPSE_FLOOR = 64;
/** Downward travel, past the floor, before the chrome hides. */
export const COLLAPSE_TRIGGER = 24;
/** Upward travel before it comes back. Smaller than the collapse trigger: reaching for something you hid should feel eager. */
export const REVEAL_TRIGGER = 16;
/** The value `CodigosScreen` has always used for its back-to-top button. */
export const BACK_TO_TOP_THRESHOLD = 400;

export const INITIAL_SCROLL_CHROME: ScrollChromeState = { collapsed: false, showBackToTop: false, anchorY: 0 };

/** The two measurements a scroll event carries alongside its offset. */
export interface ScrollViewport {
  contentHeight: number;
  layoutHeight: number;
}

export function nextScrollChromeState(prev: ScrollChromeState, offsetY: number, viewport?: ScrollViewport): ScrollChromeState {
  const y = Number.isFinite(offsetY) ? offsetY : 0;
  const showBackToTop = y > BACK_TO_TOP_THRESHOLD;

  // At (or above) the top of the list, including the negative offsets a
  // pull-to-refresh drag produces, the chrome is unconditionally shown.
  if (y <= COLLAPSE_FLOOR) {
    return same(prev, false, showBackToTop, y);
  }

  // Hitting the *bottom* of a list overscrolls past the end and springs back,
  // and that spring is a run of decreasing offsets — indistinguishable, to a
  // direction rule, from the reader scrolling up. Without this the header
  // reappeared every single time you reached the end of a list. The state is
  // held while out of bounds and the anchor is pinned to the last real offset,
  // so a genuine drag back up still has to travel `REVEAL_TRIGGER` from there.
  if (viewport && isOverscrolledPastEnd(y, viewport)) {
    return same(prev, prev.collapsed, showBackToTop, Math.max(prev.anchorY, maxOffset(viewport)));
  }

  if (y > prev.anchorY) {
    // Moving down. While already collapsed the anchor tracks the deepest point,
    // so a reveal is measured from where the user actually turned around.
    if (prev.collapsed || y - prev.anchorY >= COLLAPSE_TRIGGER) return same(prev, true, showBackToTop, y);
    return same(prev, prev.collapsed, showBackToTop, prev.anchorY);
  }

  if (y < prev.anchorY) {
    if (!prev.collapsed || prev.anchorY - y >= REVEAL_TRIGGER) return same(prev, false, showBackToTop, y);
    return same(prev, prev.collapsed, showBackToTop, prev.anchorY);
  }

  return same(prev, prev.collapsed, showBackToTop, prev.anchorY);
}

function maxOffset(viewport: ScrollViewport): number {
  return Math.max(0, viewport.contentHeight - viewport.layoutHeight);
}

/** True only past the very end of the content — a bounce, not a scroll. */
function isOverscrolledPastEnd(offsetY: number, viewport: ScrollViewport): boolean {
  if (!Number.isFinite(viewport.contentHeight) || !Number.isFinite(viewport.layoutHeight)) return false;
  if (viewport.contentHeight <= 0 || viewport.layoutHeight <= 0) return false;
  return offsetY > maxOffset(viewport) + 0.5;
}

/** Returns `prev` itself when nothing changed, so callers can skip a `setState`. */
function same(prev: ScrollChromeState, collapsed: boolean, showBackToTop: boolean, anchorY: number): ScrollChromeState {
  if (prev.collapsed === collapsed && prev.showBackToTop === showBackToTop && prev.anchorY === anchorY) return prev;
  return { collapsed, showBackToTop, anchorY };
}

// ─── Back-to-top placement ───────────────────────────────────────────────────

/**
 * Where the back-to-top control sits, as data rather than as the comment that
 * used to carry it in `CodigosScreen`.
 *
 * A first version of the button was placed bottom-right, which is exactly where
 * `nav-shell.tsx` draws the detached Search capsule — manual testing found that
 * "Volver arriba" opened Search instead. `backToTopOverlapsSearchCapsule` turns
 * that regression into something a test can assert, so the two boxes can never
 * be moved back on top of each other unnoticed.
 */
export const BACK_TO_TOP_SIZE = 44;
export const BACK_TO_TOP_PLACEMENT = {
  left: spacing.lg,
  bottom: TAB_BAR_INSET + spacing.sm,
  size: BACK_TO_TOP_SIZE,
} as const;

/** Mirrors `nav-shell.tsx`: a 56×56 capsule at the right edge of a `spacing.lg`-padded wrapper. */
export const SEARCH_CAPSULE_SIZE = 56;

/** A rectangle in screen space, origin bottom-left, y growing upwards. */
export interface ScreenRect {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

export function backToTopRect(): ScreenRect {
  const { left, bottom, size } = BACK_TO_TOP_PLACEMENT;
  return { left, right: left + size, bottom, top: bottom + size };
}

export function searchCapsuleRect(screenWidth: number, safeAreaBottom: number): ScreenRect {
  const bottom = Math.max(safeAreaBottom, spacing.sm);
  return {
    left: screenWidth - spacing.lg - SEARCH_CAPSULE_SIZE,
    right: screenWidth - spacing.lg,
    bottom,
    top: bottom + SEARCH_CAPSULE_SIZE,
  };
}

export function rectsOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.left < b.right && b.left < a.right && a.bottom < b.top && b.bottom < a.top;
}

export function backToTopOverlapsSearchCapsule(screenWidth: number, safeAreaBottom: number): boolean {
  return rectsOverlap(backToTopRect(), searchCapsuleRect(screenWidth, safeAreaBottom));
}
