import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { hasAcknowledgedDisclosure, parseAppearancePreference, appearancePreferences } from "../apps/mobile/src/preferences-logic.ts";

const appRoot = path.join(process.cwd(), "apps/mobile");

test("first-use disclosure only considers the explicit acknowledgement value complete", () => {
  assert.equal(hasAcknowledgedDisclosure(null), false);
  assert.equal(hasAcknowledgedDisclosure(""), false);
  assert.equal(hasAcknowledgedDisclosure("acknowledged"), true);
  assert.equal(hasAcknowledgedDisclosure("true"), false);
});

test("appearance preference safely defaults to system and supports all three modes", () => {
  assert.deepEqual(appearancePreferences, ["system", "light", "dark"]);
  assert.equal(parseAppearancePreference(undefined), "system");
  assert.equal(parseAppearancePreference("light"), "light");
  assert.equal(parseAppearancePreference("dark"), "dark");
  assert.equal(parseAppearancePreference("sepia"), "system");
});

test("mobile shell keeps the required five-tab order, with Buscar among the destinations", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  const tabsStart = source.indexOf("function MainTabs");
  const tabsEnd = source.indexOf("function AppNavigation");
  assert.ok(tabsStart >= 0 && tabsEnd > tabsStart, "MainTabs must remain the Tab.Navigator owner");
  const tabsSource = source.slice(tabsStart, tabsEnd);

  // Buscar joined the tab bar. It was a modal opened from a capsule beside the pill,
  // which made it the one destination you could not find by looking at the tab bar.
  const registeredTabs = [...tabsSource.matchAll(/<Tabs\.Screen name="(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(registeredTabs, ["Inicio", "Codigos", "VademecumList", "Mapa", "Buscar"]);

  // The old standalone Guardados tab stays absorbed into Inicio.
  assert.doesNotMatch(tabsSource, /<Tabs\.Screen name="Guardados"/);

  // The modal it used to be is gone: no Search stack route, and nothing opens one.
  assert.doesNotMatch(source, /<Stack\.Screen name="Search"/);
  assert.doesNotMatch(source, /onOpenSearch/);
  assert.match(source, /GlassTabBar/);
  // It is still drawn as a detached bubble beside the pill rather than inside it —
  // see the tab bar test below for how the route is split out.

  // Buscar has to show something before a query is typed, or a tab that opens on an
  // empty list and a keyboard is worse than the modal it replaced.
  assert.match(source, /Búsquedas recientes/);
  assert.match(source, /Consultado recientemente/);
  assert.match(source, /SearchStartingPoints/);

  assert.match(source, /FirstUseDisclosure/);
  assert.match(source, /Información y ajustes/);
  assert.match(source, /Sin cuenta y sin datos de pacientes/);
});

test("the tab bar and search capsule use Liquid Glass with an honest, palette-based fallback", () => {
  const source = readFileSync(path.join(appRoot, "src", "nav-shell.tsx"), "utf8");
  assert.match(source, /from "expo-glass-effect"/);
  assert.match(source, /isGlassEffectAPIAvailable\(\)/);
  assert.match(source, /isLiquidGlassAvailable\(\)/);
  assert.match(source, /useReduceTransparency/);
  assert.match(source, /AccessibilityInfo\.isReduceTransparencyEnabled/);
  // Deliberately NOT wrapped in a GlassContainer: that component makes neighbouring glass
  // elements merge, and it drew a visible bridge between the two capsules even at spacing
  // 0. The tab pill and the search button must read as two separate objects.
  assert.doesNotMatch(source, /<GlassContainer/);
  assert.match(source, /glassEffectStyle="regular"/);
  assert.match(source, /isInteractive/);
  // Fallback path renders plain, opaque Views styled from the app's own palette tokens
  // rather than reusing GlassView/GlassContainer with the effect turned off.
  assert.match(source, /palette\.surface, borderColor: palette\.line/);
  assert.match(source, /accessibilityRole="tablist"/);
  assert.match(source, /accessibilityTargetStyle\(\)/);

  // Buscar is a real Tabs.Screen, but it is drawn in its own bubble rather than inside the
  // pill: `SEARCH_ROUTE` is split out of `state.routes`, so navigating to it, its selected
  // state and its back behaviour stay ordinary tab behaviour while the bar keeps its shape.
  assert.match(source, /const SEARCH_ROUTE = "Buscar"/);
  assert.match(source, /state\.routes\.filter\(\(route\) => route\.name !== SEARCH_ROUTE\)/);
  assert.match(source, /state\.routes\.find\(\(route\) => route\.name === SEARCH_ROUTE\)/);
  assert.match(source, /searchCapsule/);
  assert.match(source, /accessibilityLabel=\{routeAccessibilityLabels\.Buscar\}/);
  // The bubble is a tab, not a button that opens a modal — it carries a selected state.
  assert.match(source, /accessibilityState=\{\{ selected: searchFocused \}\}/);
  assert.doesNotMatch(source, /onOpenSearch/);
});

test("platform identity uses the manual's own name without changing the package identifier", () => {
  const config = JSON.parse(readFileSync(path.join(appRoot, "app.json"), "utf8")) as { expo: { name: string; ios: { bundleIdentifier: string; infoPlist?: { CFBundleDisplayName?: string } }; android?: { label?: string } } };
  assert.equal(config.expo.name, "Manual de procedimientos SAMUR PC");
  assert.equal(config.expo.ios.infoPlist?.CFBundleDisplayName, "Manual de procedimientos SAMUR PC");
  assert.equal(config.expo.android?.label, "Manual de procedimientos SAMUR PC");
  assert.equal(config.expo.ios.bundleIdentifier, "es.madrid.samur.manual");
});
