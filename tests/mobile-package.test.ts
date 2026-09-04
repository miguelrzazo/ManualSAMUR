import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isMobileContentPackage, isMobileContentSnapshot } from "../lib/mobile-snapshot.ts";

const packageRoot = path.join(process.cwd(), "apps/mobile/src/data");

test("bundled mobile content is a valid v2 snapshot with complete route keys", () => {
  const snapshot = JSON.parse(readFileSync(path.join(packageRoot, "snapshot.json"), "utf8")) as unknown;
  assert.equal(isMobileContentSnapshot(snapshot), true);
  if (!isMobileContentSnapshot(snapshot)) return;
  assert.ok(snapshot.content.procedures.length > 200);
  assert.equal(new Set(snapshot.content.procedures.map((procedure) => procedure.routeKey)).size, snapshot.content.procedures.length);
});

test("bundled attachment manifest matches the snapshot attachment count", () => {
  const snapshot = JSON.parse(readFileSync(path.join(packageRoot, "snapshot.json"), "utf8")) as { content: { procedures: Array<{ attachments: unknown[] }> } };
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, "attachment-manifest.json"), "utf8")) as { attachments: unknown[] };
  const attachmentCount = snapshot.content.procedures.reduce((total, procedure) => total + procedure.attachments.length, 0);
  assert.equal(manifest.attachments.length, attachmentCount);
});

test("bundled snapshot and attachment manifest form an integrity-checked package", () => {
  const snapshot = JSON.parse(readFileSync(path.join(packageRoot, "snapshot.json"), "utf8")) as unknown;
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, "attachment-manifest.json"), "utf8")) as unknown;
  assert.equal(isMobileContentPackage(snapshot, manifest), true);
});

test("managed Expo config does not register runtime-only packages as plugins", () => {
  const appConfig = JSON.parse(readFileSync(path.join(process.cwd(), "apps/mobile/app.json"), "utf8")) as { expo?: { plugins?: unknown[] } };
  assert.equal(appConfig.expo?.plugins?.includes("expo-crypto") ?? false, false);
  assert.equal(appConfig.expo?.plugins?.includes("./plugins/with-ios-deployment-target") ?? false, true);
  const plugin = readFileSync(path.join(process.cwd(), "apps/mobile/plugins/with-ios-deployment-target.js"), "utf8");
  assert.match(plugin, /IPHONEOS_DEPLOYMENT_TARGET/);
  assert.match(plugin, /15\.1/);
});
