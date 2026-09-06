import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  BACK_TO_TOP_PLACEMENT,
  BACK_TO_TOP_THRESHOLD,
  COLLAPSE_FLOOR,
  COLLAPSE_TRIGGER,
  INITIAL_SCROLL_CHROME,
  REVEAL_TRIGGER,
  backToTopOverlapsSearchCapsule,
  backToTopRect,
  nextScrollChromeState,
  rectsOverlap,
  searchCapsuleRect,
  type ScrollChromeState,
} from "../apps/mobile/src/scroll-chrome-logic.ts";

const appRoot = path.join(process.cwd(), "apps/mobile");

/** Replays a scroll gesture as the sequence of offsets `onScroll` would deliver. */
function replay(offsets: number[], from: ScrollChromeState = INITIAL_SCROLL_CHROME): ScrollChromeState {
  return offsets.reduce(nextScrollChromeState, from);
}

test("scrolling down past the trigger collapses the chrome", () => {
  const state = replay([0, 40, 80, 120, 200]);
  assert.equal(state.collapsed, true);
});

test("a downward run shorter than the trigger leaves the chrome alone", () => {
  const settled: ScrollChromeState = { collapsed: false, showBackToTop: false, anchorY: 80 };
  const state = replay([80 + COLLAPSE_TRIGGER - 1], settled);
  assert.equal(state.collapsed, false);
  // The travel accumulates, though: the anchor stayed put, so one more point collapses it.
  assert.equal(replay([80 + COLLAPSE_TRIGGER], state).collapsed, true);
});

test("scrolling back up reveals the chrome without returning to the top", () => {
  const collapsed = replay([0, 120, 400, 800]);
  assert.equal(collapsed.collapsed, true);
  const revealed = replay([800 - REVEAL_TRIGGER], collapsed);
  assert.equal(revealed.collapsed, false);
  // Still deep in the list: this is direction-driven, not position-driven.
  assert.ok(revealed.anchorY > COLLAPSE_FLOOR);
});

test("an upward twitch shorter than the reveal trigger keeps the chrome collapsed", () => {
  const collapsed = replay([0, 120, 400, 800]);
  assert.equal(replay([800 - (REVEAL_TRIGGER - 1)], collapsed).collapsed, true);
});

test("the reveal is measured from the deepest point of the downward run, not from where it began", () => {
  // Without an anchor that tracks the descent, the 900 → 884 reversal would be
  // compared against the offset the collapse happened at and never reveal.
  const state = replay([0, 100, 300, 600, 900, 900 - REVEAL_TRIGGER]);
  assert.equal(state.collapsed, false);
});

test("pull-to-refresh never collapses the chrome — rubber-band offsets are negative", () => {
  const collapsed = replay([0, 120, 400]);
  assert.equal(collapsed.collapsed, true);
  const pulled = replay([200, 60, 0, -40, -90, -60, -10], collapsed);
  assert.equal(pulled.collapsed, false);
  // And a further "downward" move back towards zero from a deep pull must not
  // re-collapse while still at the top of the list.
  assert.equal(replay([-90, -40, 0, 20], pulled).collapsed, false);
});

test("reaching the end of a list does not re-expand the chrome when the bounce springs back", () => {
  // 5000pt of content in an 800pt window: the last real offset is 4200.
  const viewport = { contentHeight: 5000, layoutHeight: 800 };
  let state = replay([0, 200, 2000, 4200]);
  assert.equal(state.collapsed, true);

  // Overscroll past the end and spring back — every one of these is a *decreasing*
  // offset, which a naive direction rule reads as "the reader scrolled up".
  for (const y of [4260, 4240, 4215, 4202, 4200]) {
    state = nextScrollChromeState(state, y, viewport);
    assert.equal(state.collapsed, true, `bounce at ${y} must not reveal the chrome`);
  }

  // A real drag back up from the bottom still does.
  assert.equal(nextScrollChromeState(state, 4200 - REVEAL_TRIGGER, viewport).collapsed, false);
});

test("a viewport that has not been measured yet is ignored rather than trusted", () => {
  const unmeasured = { contentHeight: 0, layoutHeight: 0 };
  const state = replay([0, 200, 900]);
  assert.equal(nextScrollChromeState(state, 900 - REVEAL_TRIGGER, unmeasured).collapsed, false);
});

test("the chrome is never collapsed at or above the collapse floor", () => {
  for (const y of [-100, -1, 0, 1, COLLAPSE_FLOOR]) {
    assert.equal(replay([y], { collapsed: true, showBackToTop: true, anchorY: 900 }).collapsed, false, `offset ${y}`);
  }
});

test("back-to-top appears only past its own threshold, independent of the collapse", () => {
  assert.equal(replay([BACK_TO_TOP_THRESHOLD]).showBackToTop, false);
  assert.equal(replay([BACK_TO_TOP_THRESHOLD + 1]).showBackToTop, true);
  // Revealing the chrome on a scroll-up must not take the control away with it.
  const deep = replay([0, 200, 900]);
  assert.equal(replay([880], deep).showBackToTop, true);
});

test("a scroll that changes nothing returns the previous object so callers can skip a setState", () => {
  const state = replay([0, 200, 900]);
  assert.equal(nextScrollChromeState(state, 900), state);
});

test("non-finite offsets are treated as the top of the list rather than poisoning the anchor", () => {
  const state = nextScrollChromeState({ collapsed: true, showBackToTop: true, anchorY: 900 }, Number.NaN);
  assert.equal(state.collapsed, false);
  assert.equal(state.anchorY, 0);
});

// ─── The #77 regression, as geometry ────────────────────────────────────────

test("back-to-top never overlaps the floating Search capsule on any phone width", () => {
  for (let width = 320; width <= 440; width += 4) {
    for (const safeAreaBottom of [0, 8, 21, 34]) {
      assert.equal(
        backToTopOverlapsSearchCapsule(width, safeAreaBottom),
        false,
        `overlap at width ${width}, safe area ${safeAreaBottom}`,
      );
    }
  }
});

test("back-to-top sits on the left, clear of the right-hand capsule, and above the tab pill", () => {
  const button = backToTopRect();
  const capsule = searchCapsuleRect(393, 34);
  assert.equal(BACK_TO_TOP_PLACEMENT.left, button.left);
  assert.ok(button.right < capsule.left, "the button must stay left of the Search capsule");
  assert.ok(button.bottom > capsule.top, "and above it, so a tall safe area cannot close the gap");
});

test("rectsOverlap actually detects an overlap — the guard above is not vacuous", () => {
  const capsule = searchCapsuleRect(393, 34);
  assert.equal(rectsOverlap(capsule, capsule), true);
  assert.equal(rectsOverlap(backToTopRect(), backToTopRect()), true);
});

// ─── Wiring ─────────────────────────────────────────────────────────────────

test("every scrollable destination collapses its chrome and offers back-to-top", () => {
  const surfaces = [
    "App.tsx",
    "src/screens/CodigosScreen.tsx",
    "src/screens/VademecumScreen.tsx",
  ];
  for (const file of surfaces) {
    const source = readFileSync(path.join(appRoot, file), "utf8");
    assert.match(source, /BackToTop/, `${file} must offer the back-to-top control`);
    assert.match(source, /useScrollChrome/, `${file} must drive its chrome from the shared hook`);
  }
});

test("only a change of the two visible flags reaches React state", () => {
  // The reducer moves `anchorY` on nearly every frame; the hook must not turn
  // that into a re-render of a list with hundreds of rows.
  const source = readFileSync(path.join(appRoot, "src/hooks/use-scroll-chrome.ts"), "utf8");
  assert.match(source, /next\.collapsed === previous\.collapsed && next\.showBackToTop === previous\.showBackToTop/);
  // And the reducer keeps producing those anchor-only states, which is what makes
  // the guard necessary rather than decorative.
  const scrolling = replay([0, 200, 900]);
  const deeper = nextScrollChromeState(scrolling, 940);
  assert.notEqual(deeper, scrolling);
  assert.equal(deeper.collapsed, scrolling.collapsed);
  assert.equal(deeper.showBackToTop, scrolling.showBackToTop);
  assert.notEqual(deeper.anchorY, scrolling.anchorY);
});

test("collapsing leaves a compact bar behind, never a list running into the status bar", () => {
  for (const file of ["App.tsx", "src/screens/CodigosScreen.tsx", "src/screens/VademecumScreen.tsx"]) {
    const source = readFileSync(path.join(appRoot, file), "utf8");
    assert.match(source, /chrome\.collapsed && <CompactHeader/, `${file} must keep a bar when collapsed`);
  }
  const bar = readFileSync(path.join(appRoot, "src/components/CompactHeader.tsx"), "utf8");
  // 44pt is the platform navigation-bar height and the minimum touch target.
  assert.match(bar, /minHeight: 44/);
  // And the collapsed state must not lock the reader out of search: the bar
  // carries the way back to the full header.
  assert.match(bar, /onExpand/);
});

test("the back-to-top control animates in and out instead of popping", () => {
  const source = readFileSync(path.join(appRoot, "src/components/BackToTop.tsx"), "utf8");
  assert.match(source, /Animated/);
  assert.match(source, /useNativeDriver: true/);
  // Hidden but mounted: an unmounted button cannot animate out, and a mounted one
  // that still takes touches would swallow taps meant for the list.
  assert.match(source, /pointerEvents=\{visible \? "auto" : "none"\}/);
});

test("the procedure reader hands its title to the top bar instead of showing it twice", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  const start = source.indexOf("function ProcedureScreen");
  const end = source.indexOf("function DoseUtilityCard");
  assert.ok(start >= 0 && end > start);
  const procedureScreen = source.slice(start, end);
  assert.match(procedureScreen, /headerTitle:/, "the header title must be rendered, not just set as a string");
  assert.match(procedureScreen, /interpolate/, "and driven by the scroll position");
  assert.match(procedureScreen, /Animated\.ScrollView/);
});

// ─── Search result rows ─────────────────────────────────────────────────────

test("mixed search results lead with what kind of thing they are, not with an id", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  const start = source.indexOf("function ProcedureRow");
  const end = source.indexOf("\n// Inicio's actual content", start);
  const row = source.slice(start, end < 0 ? undefined : end);
  // The tile carries a kind glyph; the id moves to the meta line, where it is
  // still readable and no longer wraps mid-identifier.
  assert.match(row, /name="clipboard-text-outline"/);
  assert.doesNotMatch(row, /styles\.resourceCodeText/);
  assert.match(row, /\{procedure\.id\} ·/);
});

test("a code result shows its number next to its name, not greyed out underneath", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  const start = source.indexOf("function ReferenceRow");
  const end = source.indexOf("\n// Favorites/recents rendering", start);
  const row = source.slice(start, end < 0 ? undefined : end);
  assert.match(row, /reference\.kind === "code" && reference\.badge \? <Text style=\{styles\.resourceInlineCode\}/);
  // Non-code badges ("PERF", "MARCA") are classifications and stay in the meta line.
  assert.match(row, /reference\.kind !== "code" && reference\.badge/);
});
