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

test("mobile shell keeps the required tab order and first-use/settings surfaces", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  assert.match(source, /name="Inicio"/);
  assert.match(source, /name="Buscar"/);
  assert.match(source, /name="Guardados"/);
  assert.match(source, /name="Mapa"/);
  assert.match(source, /FirstUseDisclosure/);
  assert.match(source, /Información y ajustes/);
  assert.match(source, /No se solicitan cuentas ni datos de pacientes/);
});

test("platform identity uses Pulso abierto without changing the package identifier", () => {
  const config = JSON.parse(readFileSync(path.join(appRoot, "app.json"), "utf8")) as { expo: { name: string; ios: { bundleIdentifier: string; infoPlist?: { CFBundleDisplayName?: string } }; android?: { label?: string } } };
  assert.equal(config.expo.name, "Pulso abierto");
  assert.equal(config.expo.ios.infoPlist?.CFBundleDisplayName, "Pulso abierto");
  assert.equal(config.expo.android?.label, "Pulso abierto");
  assert.equal(config.expo.ios.bundleIdentifier, "es.madrid.samur.manual");
});
