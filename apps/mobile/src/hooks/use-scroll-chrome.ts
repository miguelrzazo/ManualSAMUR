import { useCallback, useRef, useState } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { INITIAL_SCROLL_CHROME, nextScrollChromeState, type ScrollChromeState } from "../scroll-chrome-logic.ts";
import { animateNextLayout, useReduceMotion } from "./motion.ts";

export interface ScrollChrome {
  /** True while the header block above the list is hidden. */
  collapsed: boolean;
  showBackToTop: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Attach to the same list, so `onScroll` fires often enough to read a direction. */
  scrollEventThrottle: number;
  /** Call alongside a programmatic scroll to the top so the chrome comes back with it. */
  reset: () => void;
  /**
   * Restore the header without moving the list — what the compact bar's
   * magnifier does. The scroll anchor is kept, so the very next downward scroll
   * still has to travel `COLLAPSE_TRIGGER` before it hides again.
   */
  expand: () => void;
}

/**
 * Drives the collapsing header and the back-to-top control from one scroll
 * stream. The decision itself lives in `scroll-chrome-logic.ts`; this only
 * translates RN scroll events into it and animates the resulting layout change.
 *
 * The collapse is a height change, which the native driver cannot animate, so it
 * goes through `animateNextLayout` — the same LayoutAnimation helper the
 * Vademécum category disclosure already uses, and already a no-op under Reduce
 * Motion. It is queued only on the frame the state actually flips, never per
 * scroll event.
 */
export function useScrollChrome(): ScrollChrome {
  const reduceMotion = useReduceMotion();
  const [state, setState] = useState<ScrollChromeState>(INITIAL_SCROLL_CHROME);
  // The reducer input has to be the *latest* state, not the one captured by the
  // render this handler was created in: scroll events arrive far faster than
  // React commits, and a stale anchor makes the direction read backwards.
  const latest = useRef(state);

  const apply = useCallback(
    (next: ScrollChromeState) => {
      const previous = latest.current;
      if (next === previous) return;
      latest.current = next;
      // `anchorY` moves on almost every frame of every scroll. Committing that to
      // React state would put a full re-render of the screen — a SectionList with
      // hundreds of rows — on every scroll event; only the two visible flags are
      // worth a render.
      if (next.collapsed === previous.collapsed && next.showBackToTop === previous.showBackToTop) return;
      if (next.collapsed !== previous.collapsed) animateNextLayout(reduceMotion);
      setState(next);
    },
    [reduceMotion],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      apply(
        nextScrollChromeState(latest.current, contentOffset.y, {
          contentHeight: contentSize.height,
          layoutHeight: layoutMeasurement.height,
        }),
      );
    },
    [apply],
  );

  const reset = useCallback(() => apply(INITIAL_SCROLL_CHROME), [apply]);
  const expand = useCallback(() => apply({ ...latest.current, collapsed: false }), [apply]);

  return { collapsed: state.collapsed, showBackToTop: state.showBackToTop, onScroll, scrollEventThrottle: 16, reset, expand };
}
