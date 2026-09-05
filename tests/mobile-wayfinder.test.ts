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

test("mobile shell keeps the required four-tab order, with search as a separate non-tab destination", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  const tabsStart = source.indexOf("function MainTabs");
  const tabsEnd = source.indexOf("function AppNavigation");
  assert.ok(tabsStart >= 0 && tabsEnd > tabsStart, "MainTabs must remain the Tab.Navigator owner");
  const tabsSource = source.slice(tabsStart, tabsEnd);

  // Exactly four destinations, in the revised information architecture order.
  const registeredTabs = [...tabsSource.matchAll(/<Tabs\.Screen name="(\w+)"/g)].map((match) => match[1]);
  assert.deepEqual(registeredTabs, ["Inicio", "Codigos", "VademecumList", "Mapa"]);

  // Search and the old Guardados tab must not be registered as Tabs.Screen entries.
  assert.doesNotMatch(tabsSource, /<Tabs\.Screen name="Buscar"/);
  assert.doesNotMatch(tabsSource, /<Tabs\.Screen name="Guardados"/);

  // Search is rehomed to the root Stack as its own destination, reachable from a
  // detached capsule rather than the tab bar (see GlassTabBar in src/nav-shell.tsx).
  assert.match(source, /<Stack\.Screen name="Search" component=\{SearchScreen\}/);
  assert.match(source, /GlassTabBar/);
  assert.match(source, /onOpenSearch=\{\(\) => props\.navigation\.getParent\(\)\?\.navigate\("Search"\)\}/);

  assert.match(source, /FirstUseDisclosure/);
  assert.match(source, /Información y ajustes/);
  assert.match(source, /No se solicitan cuentas ni datos de pacientes/);
});

test("the tab bar and search capsule use Liquid Glass with an honest, palette-based fallback", () => {
  const source = readFileSync(path.join(appRoot, "src", "nav-shell.tsx"), "utf8");
  assert.match(source, /from "expo-glass-effect"/);
  assert.match(source, /isGlassEffectAPIAvailable\(\)/);
  assert.match(source, /isLiquidGlassAvailable\(\)/);
  assert.match(source, /useReduceTransparency/);
  assert.match(source, /AccessibilityInfo\.isReduceTransparencyEnabled/);
  assert.match(source, /<GlassContainer spacing=\{\d+\}/);
  assert.match(source, /glassEffectStyle="regular"/);
  assert.match(source, /isInteractive/);
  // Fallback path renders plain, opaque Views styled from the app's own palette tokens
  // rather than reusing GlassView/GlassContainer with the effect turned off.
  assert.match(source, /palette\.surface, borderColor: palette\.line/);
  assert.match(source, /accessibilityRole="tablist"/);
  assert.match(source, /accessibilityRole="search"/);
  assert.match(source, /accessibilityLabel=\{routeAccessibilityLabels\.Buscar\}/);
  assert.match(source, /accessibilityTargetStyle\(\)/);
});

test("platform identity uses Pulso abierto without changing the package identifier", () => {
  const config = JSON.parse(readFileSync(path.join(appRoot, "app.json"), "utf8")) as { expo: { name: string; ios: { bundleIdentifier: string; infoPlist?: { CFBundleDisplayName?: string } }; android?: { label?: string } } };
  assert.equal(config.expo.name, "Pulso abierto");
  assert.equal(config.expo.ios.infoPlist?.CFBundleDisplayName, "Pulso abierto");
  assert.equal(config.expo.android?.label, "Pulso abierto");
  assert.equal(config.expo.ios.bundleIdentifier, "es.madrid.samur.manual");
});
