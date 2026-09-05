import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  APPROVED_ONLINE_MAP_POLICY,
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
import { classifyOnlineMapFailure, createMapLibreOnlineMapProvider, MAPLIBRE_CARTO_STYLE_URLS } from "../apps/mobile/src/online-map-runtime.ts";

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
  assert.deepEqual(onlineMapPolicyGates(), ["owner-approval", "provider", "license", "offline-scope", "os-floor", "size-budget"]);
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
  assert.deepEqual(blockedAgain, { status: "disabled", gate: "owner-approval", fallback: "offline-directory-and-schematic" });
});

test("top-level owner approval remains a hard gate even when every sub-gate is true", () => {
  const policy = { ...approvedPolicy(), approved: false };
  assert.equal(onlineMapPolicyReady(policy), false);
  assert.equal(initialOnlineMapState(policy).status, "disabled");
  assert.deepEqual(transitionOnlineMapState({ status: "idle" }, { type: "request", request: { query: "", filter: "all" } }, policy), {
    status: "disabled",
    gate: "owner-approval",
    fallback: "offline-directory-and-schematic",
  });
});

test("release gates validate provider evidence instead of trusting approval booleans", () => {
  const cases = [
    { gate: "provider" as const, provider: { ...approvedPolicy().provider!, id: "", displayName: "" } },
    { gate: "license" as const, provider: { ...approvedPolicy().provider!, attribution: "" } },
    { gate: "os-floor" as const, provider: { ...approvedPolicy().provider!, minimumOS: { ios: 0, android: Number.NaN } } },
    { gate: "size-budget" as const, provider: { ...approvedPolicy().provider!, estimatedInstalledBytes: 2_049 } },
    { gate: "size-budget" as const, provider: { ...approvedPolicy().provider!, estimatedInstalledBytes: -1 } },
  ];
  for (const item of cases) {
    const report = evaluateOnlineMapRelease({ ...approvedPolicy(), provider: item.provider });
    assert.equal(report.ready, false);
    assert.equal(report.issues.some((issue) => issue.gate === item.gate), true, item.gate);
  }
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

test("owner has approved the MapLibre + CARTO stack, and the JSON policy matches the TS constant", () => {
  const jsonPolicy = JSON.parse(readFileSync(path.join(appRoot, "online-map-provider-policy.json"), "utf8")) as OnlineMapReleasePolicy;
  assert.equal(jsonPolicy.approved, true);
  assert.ok(jsonPolicy.provider);
  assert.equal(jsonPolicy.provider!.id, "maplibre-carto-osm");
  assert.match(jsonPolicy.provider!.attribution, /OpenStreetMap/);
  assert.match(jsonPolicy.provider!.attribution, /CARTO/);
  assert.equal(evaluateOnlineMapRelease(jsonPolicy).ready, true);
  assert.equal(onlineMapPolicyReady(jsonPolicy), true);
  // Field-for-field equality with the runtime constant App.tsx actually imports, so the
  // release-gate evidence file and the code the app ships can never drift apart.
  assert.deepEqual(jsonPolicy, APPROVED_ONLINE_MAP_POLICY);
  // The size budget gate must stay a real, measured comparison, not two equal
  // placeholders — the budget must leave headroom above the measured estimate.
  assert.ok(jsonPolicy.provider!.estimatedInstalledBytes > 0);
  assert.ok(jsonPolicy.sizeBudgetBytes >= jsonPolicy.provider!.estimatedInstalledBytes);
});

test("the approved policy resolves to zero unmet gates and an idle (not disabled) initial state", () => {
  assert.deepEqual(onlineMapPolicyGates(APPROVED_ONLINE_MAP_POLICY), []);
  assert.equal(initialOnlineMapState(APPROVED_ONLINE_MAP_POLICY).status, "idle");
});

test("map UI exposes the online map activation, attribution, and offline fallbacks", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  // The disabled-state copy stays in the source as a defensive fallback even though the
  // approved policy means it is not the state reached in normal operation.
  assert.match(source, /Mapa online no habilitado/);
  assert.match(source, /directorio y el esquema accesible siguen disponibles/);
  assert.match(source, /onlineMapFallbackLabel/);
  assert.match(source, /requestForegroundPermissionsAsync/);
  assert.match(source, /Abrir en Mapas/);
  // The map only activates after an explicit tap, never on screen load.
  assert.match(source, /Mostrar mapa online/);
  assert.match(source, /APPROVED_ONLINE_MAP_POLICY/);
  assert.match(source, /OnlineMapView/);
  assert.match(source, /ONLINE_MAP_ATTRIBUTION_TEXT/);
  assert.match(source, /classifyOnlineMapFailure/);
});

test("the online map style URLs match the web app's CARTO basemaps exactly", () => {
  assert.equal(MAPLIBRE_CARTO_STYLE_URLS.light, "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json");
  assert.equal(MAPLIBRE_CARTO_STYLE_URLS.dark, "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json");
});

test("the MapLibre provider adapter probes the style URL and returns pins sourced as online", async () => {
  const locations = locationRecords(snapshot.content);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({ ok: true, status: 200 })) as typeof fetch;
    const provider = createMapLibreOnlineMapProvider(locations);
    assert.equal(provider.providerId, "maplibre-carto-osm");
    const result = await provider.fetch({ query: "", filter: "all" });
    assert.equal(result.pins.length, locations.length);
    assert.equal(result.pins[0].source, "online");
    assert.equal(typeof result.fetchedAt, "string");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the MapLibre provider adapter rejects when the style response is not ok", async () => {
  const locations = locationRecords(snapshot.content);
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => ({ ok: false, status: 503 })) as typeof fetch;
    const provider = createMapLibreOnlineMapProvider(locations);
    await assert.rejects(provider.fetch({ query: "", filter: "all" }), /503/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("failure classification prefers stale-data over the raw error once a snapshot already loaded", () => {
  assert.equal(classifyOnlineMapFailure(new Error("Network request failed"), true), "stale-data");
  assert.equal(classifyOnlineMapFailure(new Error("Network request failed"), false), "network-unavailable");
  assert.equal(classifyOnlineMapFailure(new TypeError("boom"), false), "network-unavailable");
  const abort = new Error("Aborted");
  abort.name = "AbortError";
  assert.equal(classifyOnlineMapFailure(abort, false), "network-unavailable");
  assert.equal(classifyOnlineMapFailure(new Error("El estilo de mapa respondió con estado 503"), false), "provider-error");
});
