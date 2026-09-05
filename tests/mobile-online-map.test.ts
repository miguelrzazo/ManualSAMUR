import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_ONLINE_MAP_POLICY,
  disabledOnlineMapProvider,
  evaluateOnlineMapRelease,
  initialOnlineMapState,
  mapPinsFromLocations,
  onlineMapFallbackLabel,
  onlineMapPolicyGates,
  onlineMapPolicyReady,
  transitionOnlineMapState,
  type OnlineMapReleasePolicy,
} from "../apps/mobile/src/online-map-logic.ts";
import { locationRecords } from "../apps/mobile/src/location-logic.ts";

const appRoot = path.join(process.cwd(), "apps/mobile");
const snapshot = JSON.parse(readFileSync(path.join(appRoot, "src/data/snapshot.json"), "utf8")) as { content: { hospitals: Array<Record<string, unknown>>; bases: Array<Record<string, unknown>> } };

function approvedPolicy(): OnlineMapReleasePolicy {
  return {
    ...DEFAULT_ONLINE_MAP_POLICY,
    approved: true,
    provider: { id: "owner-approved-provider", displayName: "Approved provider", attribution: "Approved attribution", minimumOS: { ios: 16.4, android: 10 }, estimatedInstalledBytes: 1024 },
    providerApproved: true,
    licenseApproved: true,
    offlineScopeApproved: true,
    osFloorApproved: true,
    sizeBudgetApproved: true,
    sizeBudgetBytes: 2_048,
    approvalReference: "owner-approval-1",
  };
}

test("online map policy is disabled by default and reports every owner gate", () => {
  assert.equal(onlineMapPolicyReady(), false);
  assert.deepEqual(onlineMapPolicyGates(), ["provider", "license", "offline-scope", "os-floor", "size-budget"]);
  assert.equal(initialOnlineMapState().status, "disabled");
  const report = evaluateOnlineMapRelease();
  assert.equal(report.ready, false);
  assert.deepEqual(report.issues.map((issue) => issue.gate), onlineMapPolicyGates());
  assert.match(report.issues.map((issue) => issue.detail).join(" "), /proveedor/);
});

test("an approved policy is the only route out of the feature-off boundary", () => {
  const policy = approvedPolicy();
  assert.equal(onlineMapPolicyReady(policy), true);
  assert.equal(initialOnlineMapState(policy).status, "idle");
  const request = { query: "Centro", filter: "hospital" as const };
  const loading = transitionOnlineMapState(initialOnlineMapState(policy), { type: "request", request }, policy);
  assert.deepEqual(loading, { status: "loading", request });
  const online = transitionOnlineMapState(loading, { type: "success", snapshot: { fetchedAt: "2026-09-05T10:00:00Z", pins: [] } }, policy);
  assert.equal(online.status, "online");
  const blockedAgain = transitionOnlineMapState(online, { type: "failure", reason: "provider-error" }, DEFAULT_ONLINE_MAP_POLICY);
  assert.deepEqual(blockedAgain, { status: "disabled", gate: "provider", fallback: "offline-directory-and-schematic" });
});

test("network, provider, stale-data, and denied-location failures all preserve the offline fallback", () => {
  const policy = approvedPolicy();
  const state = initialOnlineMapState(policy);
  for (const reason of ["network-unavailable", "provider-error", "stale-data", "permission-denied"] as const) {
    const fallback = transitionOnlineMapState(state, { type: "failure", reason }, policy);
    assert.deepEqual(fallback, { status: "fallback", reason, fallback: "offline-directory-and-schematic" });
    assert.match(onlineMapFallbackLabel(reason), /directorio|esquema|local/);
  }
});

test("online pins reuse stable offline location identity, filters, coordinates, and route keys", () => {
  const locations = locationRecords(snapshot.content);
  const pins = mapPinsFromLocations(locations);
  assert.equal(pins.length, locations.length);
  assert.deepEqual(pins[0], {
    id: locations[0].id,
    kind: locations[0].kind,
    title: locations[0].shortName,
    coordinate: { lat: locations[0].lat, lng: locations[0].lng },
    source: "offline",
    locationRouteKey: `location:${locations[0].kind}:${locations[0].id}`,
  });
  assert.equal(new Set(pins.map((pin) => pin.locationRouteKey)).size, pins.length);
  assert.equal(mapPinsFromLocations(locations, "online")[0].source, "online");
});

test("the disabled adapter cannot accidentally make an unapproved network request", async () => {
  assert.equal(disabledOnlineMapProvider.providerId, "unconfigured");
  await assert.rejects(disabledOnlineMapProvider.fetch({ query: "", filter: "all" }), /no está configurado ni aprobado/);
});

test("policy JSON keeps provider selection and approval off until owner evidence exists", () => {
  const policy = JSON.parse(readFileSync(path.join(appRoot, "online-map-provider-policy.json"), "utf8")) as OnlineMapReleasePolicy;
  assert.deepEqual(policy.provider, null);
  assert.equal(policy.approved, false);
  assert.equal(evaluateOnlineMapRelease(policy).ready, false);
});

test("map UI exposes the feature-off boundary and offline fallbacks", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  assert.match(source, /Mapa online no habilitado/);
  assert.match(source, /directorio y el esquema accesible siguen disponibles/);
  assert.match(source, /onlineMapFallbackLabel/);
  assert.match(source, /requestForegroundPermissionsAsync/);
  assert.match(source, /Abrir en Mapas/);
});
