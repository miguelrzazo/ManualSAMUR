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

  // ...and the stack route and the capsule that used to reach it are both gone.
  assert.doesNotMatch(source, /<Stack\.Screen name="Search"/);
  assert.doesNotMatch(source, /onOpenSearch/);
  assert.match(source, /GlassTabBar/);

  // Buscar has to show something before a query is typed, or a tab that opens on an
  // empty list and a keyboard is worse than the modal it replaced.
  assert.match(source, /Búsquedas recientes/);
  assert.match(source, /Consultado recientemente/);
  assert.match(source, /SearchStartingPoints/);

  assert.match(source, /FirstUseDisclosure/);
  assert.match(source, /Información y ajustes/);
  assert.match(source, /Sin cuenta y sin datos de pacientes/);
});

test("the tab bar uses Liquid Glass with an honest, palette-based fallback", () => {
  const source = readFileSync(path.join(appRoot, "src", "nav-shell.tsx"), "utf8");
  assert.match(source, /from "expo-glass-effect"/);
  assert.match(source, /isGlassEffectAPIAvailable\(\)/);
  assert.match(source, /isLiquidGlassAvailable\(\)/);
  assert.match(source, /useReduceTransparency/);
  assert.match(source, /AccessibilityInfo\.isReduceTransparencyEnabled/);
  // Still not a GlassContainer: it makes neighbouring glass elements merge, which drew a
  // visible bridge back when there were two capsules. There is one capsule now.
  assert.doesNotMatch(source, /<GlassContainer/);
  assert.match(source, /glassEffectStyle="regular"/);
  assert.match(source, /isInteractive/);
  // Fallback path renders plain, opaque Views styled from the app's own palette tokens
  // rather than reusing GlassView/GlassContainer with the effect turned off.
  assert.match(source, /palette\.surface, borderColor: palette\.line/);
  assert.match(source, /accessibilityRole="tablist"/);
  assert.match(source, /accessibilityTargetStyle\(\)/);
  // The detached search capsule is gone with the modal it opened.
  assert.doesNotMatch(source, /searchCapsule/);
});

test("platform identity uses the manual's own name without changing the package identifier", () => {
  const config = JSON.parse(readFileSync(path.join(appRoot, "app.json"), "utf8")) as { expo: { name: string; ios: { bundleIdentifier: string; infoPlist?: { CFBundleDisplayName?: string } }; android?: { label?: string } } };
  assert.equal(config.expo.name, "Manual de procedimientos SAMUR PC");
  assert.equal(config.expo.ios.infoPlist?.CFBundleDisplayName, "Manual de procedimientos SAMUR PC");
  assert.equal(config.expo.android?.label, "Manual de procedimientos SAMUR PC");
  assert.equal(config.expo.ios.bundleIdentifier, "es.madrid.samur.manual");
});
