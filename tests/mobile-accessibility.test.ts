import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { accessibilityHints, accessibilityTargetStyle, adaptiveLayout, adaptivePalette, contrastRatio, resolveAdaptivePalette, routeAccessibilityLabels } from "../apps/mobile/src/accessibility.ts";

const appSource = readFileSync(path.join(process.cwd(), "apps/mobile/App.tsx"), "utf8");

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
      [palette.inkMuted, palette.surface], [palette.red, palette.paper], [palette.redDark, palette.redWash],
      [palette.amber, palette.amberWash], [palette.green, palette.greenWash], [palette.white, palette.redAction],
    ] as const) {
      assert.ok(contrastRatio(foreground, background) >= 4.5, `${foreground} on ${background} must meet WCAG AA`);
    }
  }
});

test("adaptive layout reflows controls at large text and separates tablet list/detail widths", () => {
  assert.deepEqual(adaptiveLayout(390, 1), { isTablet: false, singleColumn: true, listMaxWidth: 390, readingMaxWidth: 390 });
  assert.equal(adaptiveLayout(390, 2).singleColumn, true);
  assert.deepEqual(adaptiveLayout(1024, 1), { isTablet: true, singleColumn: false, listMaxWidth: 1040, readingMaxWidth: 720 });
  assert.equal(adaptiveLayout(1024, 2).singleColumn, true);
});

test("core routes expose accessibility semantics and adaptive behavior", () => {
  for (const route of ["HomeScreen", "SearchScreen", "SavedScreen", "MapScreen", "LocationDetailScreen", "ProcedureScreen", "DrugScreen", "VademecumReferenceScreen", "CodeScreen", "CodesScreen", "AbbreviationsScreen"]) {
    const start = appSource.indexOf(`function ${route}`);
    assert.ok(start >= 0, `${route} must remain a route-level surface`);
    const end = appSource.indexOf("\nfunction ", start + 10);
    const source = appSource.slice(start, end < 0 ? undefined : end);
    assert.match(source, /accessibility(Label|Role|State)/, `${route} needs an accessibility contract`);
  }
  assert.match(appSource, /AccessibilityInfo\.isReduceMotionEnabled/);
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
  assert.match(appSource, /requestForegroundPermissionsAsync/);
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

  const map = sourceFor("MapScreen");
  assert.match(map, /requestForegroundPermissionsAsync/);
  assert.match(map, /Permiso de ubicación denegado/);
  assert.match(map, /accessibilityLiveRegion="polite"/);

  const home = sourceFor("HomeScreen");
  assert.match(home, /settingsTriggerRef/);
  assert.match(home, /restoreAccessibilityFocus\(settingsTriggerRef\)/);

  const firstUse = sourceFor("FirstUseDisclosure");
  assert.match(firstUse, /accessibilityViewIsModal/);
  assert.doesNotMatch(firstUse, /SafeAreaView[^>]+\baccessible(?:=|\s|>)/);

  const locationModal = sourceFor("LocationModal");
  assert.match(locationModal, /accessibilityViewIsModal/);
  assert.match(locationModal, /accessibilityElementsHidden/);
  assert.doesNotMatch(locationModal, /locationSheet[^>]+\baccessible(?:=|\s|>)/);
});
