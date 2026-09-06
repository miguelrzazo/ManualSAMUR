import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { accessibilityHints, accessibilityTargetStyle, adaptiveLayout, adaptivePalette, contrastRatio, resolveAdaptivePalette, routeAccessibilityLabels } from "../apps/mobile/src/accessibility.ts";

const appSource = readFileSync(path.join(process.cwd(), "apps/mobile/App.tsx"), "utf8");
// `useReduceMotion` moved out of App.tsx into src/hooks/motion.ts so the shared
// components under src/components/ can gate their own animations on the same
// signal instead of each re-querying AccessibilityInfo.
const motionHookSource = readFileSync(path.join(process.cwd(), "apps/mobile/src/hooks/motion.ts"), "utf8");
// Códigos (T5c) was extracted out of App.tsx into its own module so the grouping/filter/jump
// UI wouldn't balloon the already-huge App.tsx file further; its accessibility contract is
// checked against that module instead of the inline `function CodesScreen` App.tsx used to have.
const codigosScreenSource = readFileSync(path.join(process.cwd(), "apps/mobile/src/screens/CodigosScreen.tsx"), "utf8");
// Inicio (T5b) was extracted the same way: it absorbed the old Guardados screen's
// favorites/recents and became the manual tree + update history, which would have
// made App.tsx worse still. `HomeScreen` remains in App.tsx only as a thin wrapper
// around the brand header and the settings modal — its own accessibility contract
// (settingsTriggerRef/restoreAccessibilityFocus) is still checked against App.tsx
// below, but the tree/favorites/history accessibility contract lives here instead.
const inicioScreenSource = readFileSync(path.join(process.cwd(), "apps/mobile/src/screens/InicioScreen.tsx"), "utf8");
// Mapa (T5e) was extracted the same way: the owner's redirect to a full-screen map
// with floating controls needed its own module rather than growing the inline
// `function MapScreen` App.tsx used to have — see src/screens/MapaScreen.tsx.
const mapaScreenSource = readFileSync(path.join(process.cwd(), "apps/mobile/src/screens/MapaScreen.tsx"), "utf8");

test("route accessibility contracts provide stable, speakable names", () => {
  for (const [route, label] of Object.entries(routeAccessibilityLabels)) {
    assert.ok(label.trim().length >= 3, `${route} needs a speakable label`);
    assert.doesNotMatch(label, /^[^a-záéíóúüñ]+$/i, `${route} must not be symbol-only`);
  }
  assert.equal(accessibilityHints.openDetail.length > 10, true);
  assert.deepEqual(accessibilityTargetStyle(), { minWidth: 44, minHeight: 44 });
});

test("adaptive palette maintains readable light and dark foreground/background pairs", () => {
  assert.equal(resolveAdaptivePalette("light"), adaptivePalette.light);
  assert.equal(resolveAdaptivePalette("dark"), adaptivePalette.dark);
  assert.notEqual(adaptivePalette.light.paper, adaptivePalette.dark.paper);
  assert.notEqual(adaptivePalette.light.ink, adaptivePalette.dark.ink);
  for (const palette of [adaptivePalette.light, adaptivePalette.dark]) {
    for (const [foreground, background] of [
      [palette.ink, palette.paper], [palette.ink, palette.surface], [palette.inkMuted, palette.paper],
      [palette.inkMuted, palette.surface], [palette.inkMuted, palette.surfaceMuted],
      // The identity blue has to survive on all three grounds, not just the lightest one.
      [palette.primary, palette.paper], [palette.primary, palette.surface], [palette.primary, palette.surfaceMuted],
      [palette.primaryDark, palette.primaryWash], [palette.white, palette.primaryAction],
      // `danger` is a separate role from `primary` precisely so an error still reads as one.
      [palette.danger, palette.paper], [palette.dangerDark, palette.dangerWash],
      [palette.amber, palette.amberWash], [palette.green, palette.greenWash],
      [palette.amber, palette.paper], [palette.green, palette.paper],
    ] as const) {
      assert.ok(contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background} must meet WCAG AA`);
    }
    // Not text: `lineStrong` draws the boundary of a control, so WCAG 1.4.11's 3:1 applies.
    // `line` is decorative hairline separation and is deliberately exempt.
    for (const background of [palette.paper, palette.surface, palette.surfaceMuted]) {
      assert.ok(contrastRatio(palette.lineStrong, background) >= 3, `lineStrong on ${background} must meet WCAG 1.4.11`);
    }
    assert.notEqual(palette.primary, palette.danger);
  }
});

test("adaptive layout reflows controls at large text and separates tablet list/detail widths", () => {
  assert.deepEqual(adaptiveLayout(390, 1), { isTablet: false, singleColumn: true, listMaxWidth: 390, readingMaxWidth: 390 });
  assert.equal(adaptiveLayout(390, 2).singleColumn, true);
  assert.deepEqual(adaptiveLayout(1024, 1), { isTablet: true, singleColumn: false, listMaxWidth: 1040, readingMaxWidth: 720 });
  assert.equal(adaptiveLayout(1024, 2).singleColumn, true);
});

test("core routes expose accessibility semantics and adaptive behavior", () => {
  for (const route of ["SearchScreen", "LocationDetailScreen", "ProcedureScreen", "DrugScreen", "VademecumReferenceScreen", "CodeScreen", "AbbreviationsScreen"]) {
    const start = appSource.indexOf(`function ${route}`);
    assert.ok(start >= 0, `${route} must remain a route-level surface`);
    const end = appSource.indexOf("\nfunction ", start + 10);
    const source = appSource.slice(start, end < 0 ? undefined : end);
    // A route satisfies its contract either by declaring one inline or by
    // installing the platform header via `useDetailHeader`, which supplies the
    // accessible back button and the labelled favourite control. The header path
    // is checked on its own below so this is not a way to opt out of coverage.
    assert.match(
      source,
      /accessibility(Label|Role|State)|useDetailHeader\(/,
      `${route} needs an accessibility contract`,
    );
  }

  // Contracts that moved into the shared components must still exist somewhere.
  const componentSource = ["Press", "FavoriteToggle", "ListRow", "SearchField", "EmptyState", "Chip", "Disclosure", "PageHeader", "LocationDirectory"]
    .map((name) => readFileSync(path.join(process.cwd(), `apps/mobile/src/components/${name}.tsx`), "utf8"));
  for (const [index, source] of componentSource.entries()) {
    assert.match(source, /accessibility(Label|Role|State)|accessibilityTargetStyle/, `shared component ${index} needs an accessibility contract`);
  }
  const favoriteToggle = componentSource[1];
  assert.match(favoriteToggle, /accessibilityState=\{\{ selected: favorite \}\}/, "the favourite control must announce its state");
  assert.match(favoriteToggle, /Quitar\$\{subject\} de favoritos/, "one phrasing for the favourite control, not three");
  const disclosure = componentSource[6];
  assert.match(disclosure, /accessibilityState=\{\{ expanded: open \}\}/, "collapsed clinical copy must announce that it is collapsed");
  assert.match(appSource, /useDetailHeader\(/, "pushed screens use the platform header");
  // CodigosScreen and InicioScreen live in their own modules (see comments above) —
  // check them there instead.
  assert.match(codigosScreenSource, /export function CodigosScreen/, "CodigosScreen must remain a route-level surface");
  assert.match(codigosScreenSource, /accessibility(Label|Role|State)/, "CodigosScreen needs an accessibility contract");
  assert.match(inicioScreenSource, /export function InicioScreen/, "InicioScreen must remain a route-level surface");
  assert.match(inicioScreenSource, /accessibility(Label|Role|State)/, "InicioScreen needs an accessibility contract");
  assert.match(inicioScreenSource, /accessibilityState=\{\{ expanded: item\.expanded \}\}/, "InicioScreen must announce tree expansion state");
  assert.match(mapaScreenSource, /export function MapaScreen/, "MapaScreen must remain a route-level surface");
  assert.match(mapaScreenSource, /accessibility(Label|Role|State)/, "MapaScreen needs an accessibility contract");
  assert.doesNotMatch(appSource, /function SavedScreen/, "the old unrouted Guardados screen must not linger in App.tsx");
  assert.match(motionHookSource, /AccessibilityInfo\.isReduceMotionEnabled/);
  assert.match(motionHookSource, /reduceMotionChanged/);
  assert.match(motionHookSource, /if \(reduceMotion\) return;/, "layout animations must be skipped under Reduce Motion");
  assert.match(appSource, /reduceMotion \? "none"/);
  assert.match(appSource, /useColorScheme/);
  assert.match(appSource, /useWindowDimensions/);
  assert.match(appSource, /accessibilityTargetStyle\(\)/);
  assert.match(appSource, /maxWidth: 960/);
  assert.match(appSource, /findNodeHandle/);
  assert.match(appSource, /setAccessibilityFocus/);
  assert.match(appSource, /accessibilityLiveRegion="polite"/);
  assert.match(appSource, /accessibilityState=\{\{ busy: isActive \}\}/);
  assert.match(appSource, /accessibilityLabel="Auditoría completa del resultado de dosis"/);
  // Location permission requests moved with Mapa into its own module (T5e).
  assert.match(mapaScreenSource, /requestForegroundPermissionsAsync/);
});

test("route contracts expose the important stateful workflows", () => {
  const sourceFor = (route: string) => {
    const start = appSource.indexOf(`function ${route}`);
    assert.ok(start >= 0, `${route} must remain a route-level surface`);
    const end = appSource.indexOf("\nfunction ", start + 10);
    return appSource.slice(start, end < 0 ? undefined : end);
  };

  const procedure = sourceFor("ProcedureScreen");
  assert.match(procedure, /actualizaciones editoriales/);
  assert.match(procedure, /accessibilityLiveRegion="polite"/);
  assert.match(procedure, /anexo \$\{attachment\.filename\}/);
  assert.match(procedure, /busy: isActive/);

  const drug = sourceFor("DrugScreen");
  assert.match(drug, /DoseUtilityCard/);
  const dose = sourceFor("DoseUtilityCard");
  assert.match(dose, /Auditoría completa del resultado de dosis/);
  assert.match(dose, /accessibilityLiveRegion="polite"/);

  assert.match(mapaScreenSource, /requestForegroundPermissionsAsync/);
  assert.match(mapaScreenSource, /Permiso de ubicación denegado/);
  assert.match(mapaScreenSource, /accessibilityLiveRegion="polite"/);

  const home = sourceFor("HomeScreen");
  assert.match(home, /settingsTriggerRef/);
  assert.match(home, /restoreAccessibilityFocus\(settingsTriggerRef\)/);

  const firstUse = sourceFor("FirstUseDisclosure");
  assert.match(firstUse, /accessibilityViewIsModal/);
  assert.match(firstUse, /<ScrollView[\s\S]*flexGrow: 1/);
  assert.match(firstUse, /contentContainerStyle=\{\{[^}]*justifyContent: "space-between"/);
  assert.doesNotMatch(firstUse, /SafeAreaView[^>]+\baccessible(?:=|\s|>)/);

  // `LocationModal` was a full sheet duplicating `LocationDetailScreen` with no
  // callers left. It stays deleted; the route is the one place a location opens.
  assert.doesNotMatch(appSource, /function LocationModal/, "the unrouted location sheet must not come back");
  const locationDetail = sourceFor("LocationDetailScreen");
  assert.match(locationDetail, /Abrir en Mapas/);
  assert.match(locationDetail, /accessibilityLiveRegion="polite"/);

  // App.tsx's own `SearchBar` (and the unexplained green "offline" dot it drew inside the
  // field) is gone; the shared component is the only search field left, and it is the one
  // that has to carry the read-only/button distinction.
  assert.doesNotMatch(appSource, /function SearchBar/, "the duplicate search field must not come back");
  const searchField = readFileSync(path.join(process.cwd(), "apps/mobile/src/components/SearchField.tsx"), "utf8");
  assert.match(searchField, /accessibilityRole="button"/);
  assert.match(searchField, /accessibilityHint=\{accessibilityHints\.search\}/);
  assert.match(appSource, /forwardRef<View, PressableProps>/);
  assert.match(appSource, /styles\.minimumTarget/);
});

// `palette.ink` is a foreground token: in dark mode it resolves to a near-white
// (#F5F7FB). Filling a control with it and labelling that fill `palette.white`
// therefore renders white on white — which is what the map's "Mostrar mapa
// online" pill did until dark mode was actually walked. `palette.paper` is ink's
// counterpart and inverts with it, so an ink fill always takes paper text.
test("an ink fill is never labelled with a fixed white, in any screen module", () => {
  const modules: Array<[string, string]> = [
    ["App.tsx", appSource],
    ["CodigosScreen.tsx", codigosScreenSource],
    ["InicioScreen.tsx", inicioScreenSource],
    ["MapaScreen.tsx", mapaScreenSource],
    ["VademecumScreen.tsx", readFileSync(path.join(process.cwd(), "apps/mobile/src/screens/VademecumScreen.tsx"), "utf8")],
    ["LocationDirectory.tsx", readFileSync(path.join(process.cwd(), "apps/mobile/src/components/LocationDirectory.tsx"), "utf8")],
    ["Chip.tsx", readFileSync(path.join(process.cwd(), "apps/mobile/src/components/Chip.tsx"), "utf8")],
  ];
  for (const [name, source] of modules) {
    // Every style object that fills with ink must pair with paper, never white.
    const inkFills = source.match(/\{[^{}]*backgroundColor: palette\.ink[^{}]*\}/g) ?? [];
    for (const style of inkFills) {
      assert.doesNotMatch(style, /color: palette\.white/, `${name}: an ink fill must use palette.paper for its label, not palette.white`);
    }
  }

  // And the pairing itself has to survive the contrast bar in both schemes.
  for (const palette of [adaptivePalette.light, adaptivePalette.dark]) {
    assert.ok(contrastRatio(palette.paper, palette.ink) >= 4.5, "paper on ink must meet WCAG AA");
  }
});
