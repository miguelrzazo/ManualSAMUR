import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  filterLocations,
  haversineDistanceMeters,
  isLocationStale,
  locationFavoriteId,
  locationPolicyReady,
  locationPolicyStatus,
  locationRecords,
  locationRouteKey,
  parseLocationRouteKey,
  platformMapsUrl,
  resolveLocationRoute,
  schematicNodes,
  sortLocationsByDistance,
  type LocationRecord,
} from "../apps/mobile/src/location-logic.ts";

const appRoot = path.join(process.cwd(), "apps/mobile");
const snapshot = JSON.parse(readFileSync(path.join(appRoot, "src/data/snapshot.json"), "utf8")) as { generatedAt: string; content: { hospitals: Array<Record<string, unknown>>; bases: Array<Record<string, unknown>> } };
const locations = locationRecords(snapshot.content);

test("location package exposes stable, favorite-compatible hospital and base identifiers", () => {
  assert.equal(locations.filter((location) => location.kind === "hospital").length, snapshot.content.hospitals.length);
  assert.equal(locations.filter((location) => location.kind === "base").length, snapshot.content.bases.length);
  const hospital = locations[0];
  assert.equal(locationRouteKey(hospital), `location:${hospital.kind}:${hospital.id}`);
  assert.equal(locationFavoriteId(hospital), locationRouteKey(hospital));
  assert.equal(new Set(locations.map(locationRouteKey)).size, locations.length);
  assert.deepEqual(parseLocationRouteKey(locationRouteKey(hospital)), { kind: hospital.kind, id: hospital.id });
  assert.equal(resolveLocationRoute(locations, locationRouteKey(hospital))?.id, hospital.id);
  assert.equal(parseLocationRouteKey("location:unknown:HGM"), undefined);
  assert.equal(resolveLocationRoute(locations, "location:hospital:not-present"), undefined);
});

test("offline search and type filters cover id, name, address, and district", () => {
  assert.equal(filterLocations(locations, "Gregorio").find((item) => item.id === "HGM")?.kind, "hospital");
  assert.equal(filterLocations(locations, "Centro", "base").every((item) => item.kind === "base"), true);
  assert.equal(filterLocations(locations, "HGM", "base").length, 0);
});

test("nearest uses on-device straight-line distance and defaults callers to hospitals", () => {
  const origin = { lat: 40.4186, lng: -3.671 };
  const hospitals = filterLocations(locations, "", "hospital");
  const nearest = sortLocationsByDistance(hospitals, origin);
  assert.equal(nearest[0].id, "HGM");
  assert.ok((nearest[0].distanceMeters ?? 0) < 1);
  assert.ok(haversineDistanceMeters(origin, { lat: 40.4258, lng: -3.7069 }) > 0);
  assert.equal("travelTime" in nearest[0], false);
});

test("schematic nodes preserve the same location information as the accessible list", () => {
  const nodes = schematicNodes(locations);
  assert.deepEqual(nodes.map((node) => node.id), locations.map((location) => location.id));
  for (const node of nodes) {
    const location = locations.find((item) => item.id === node.id && item.kind === node.kind);
    assert.ok(location);
    assert.deepEqual(node, {
      id: location.id,
      kind: location.kind,
      name: location.name,
      shortName: location.shortName,
      address: location.address,
      district: location.district,
      lat: location.lat,
      lng: location.lng,
      sourceDate: location.sourceDate,
      sourcePolicyApproved: location.sourcePolicyApproved,
    });
  }
});

test("source freshness is visible but production remains blocked until owner approval", () => {
  assert.equal(locationPolicyReady(), false);
  assert.equal(locationPolicyStatus(), "unapproved");
  assert.equal(isLocationStale("2026-09-01", new Date("2026-09-05T00:00:00Z")), false);
  assert.equal(isLocationStale("2026-07-01", new Date("2026-09-05T00:00:00Z")), true);
});

test("maps handoff uses platform URL schemes without embedding routing", () => {
  const location: Pick<LocationRecord, "name" | "lat" | "lng"> = { name: "Hospital HGM", lat: 40.4186, lng: -3.671 };
  assert.match(platformMapsUrl(location, "ios"), /^http:\/\/maps\.apple\.com\/\?ll=/);
  assert.match(platformMapsUrl(location, "android"), /^geo:/);
  assert.doesNotMatch(platformMapsUrl(location, "ios"), /directions|route|travel/);
});

test("location screen requests permission only from an explicit action and keeps fallback surfaces", () => {
  const source = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  assert.match(source, /Usar mi ubicación/);
  assert.match(source, /requestForegroundPermissionsAsync/);
  assert.match(source, /Permiso de ubicación denegado/);
  assert.match(source, /Vista accesible/);
  assert.match(source, /Abrir en Mapas/);
});
