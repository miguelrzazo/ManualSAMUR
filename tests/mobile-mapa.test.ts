import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatDistanceLabel, isWithinMadridBounds, mapCameraTargetFor, nearestLocationOfKind } from "../apps/mobile/src/mapa-logic.ts";
import { MADRID_OFFLINE_PACK_BOUNDS } from "../apps/mobile/src/offline-map-pack-logic.ts";
import { locationRecords } from "../apps/mobile/src/location-logic.ts";

const appRoot = path.join(process.cwd(), "apps/mobile");
const snapshot = JSON.parse(readFileSync(path.join(appRoot, "src/data/snapshot.json"), "utf8")) as { content: { hospitals: Array<Record<string, unknown>>; bases: Array<Record<string, unknown>> } };
const locations = locationRecords(snapshot.content);

test("the camera target flips lat/lng into MapLibre's [longitude, latitude] order", () => {
  const location = locations[0];
  assert.deepEqual(mapCameraTargetFor(location), [location.lng, location.lat]);
});

test("nearest-of-kind never substitutes a different kind and requires an origin", () => {
  assert.equal(nearestLocationOfKind(locations, undefined, "hospital"), undefined);
  const origin = { lat: 40.4186, lng: -3.671 };
  const nearestHospital = nearestLocationOfKind(locations, origin, "hospital");
  assert.equal(nearestHospital?.kind, "hospital");
  const nearestBase = nearestLocationOfKind(locations, origin, "base");
  assert.equal(nearestBase?.kind, "base");
});

test("distance labels switch from meters to kilometers at 1000m, with a Spanish decimal comma", () => {
  assert.equal(formatDistanceLabel(undefined), undefined);
  assert.match(formatDistanceLabel(250) ?? "", /^250 m$/);
  assert.match(formatDistanceLabel(1500) ?? "", /^1,5 km$/);
  // The distance is still straight-line and the app still makes no travel-time claim; the
  // qualification moved out of the per-row label and into the hint of the control that
  // computes it, instead of repeating on all sixty rows of the directory.
  const mapaSource = readFileSync(path.join(appRoot, "src/screens/MapaScreen.tsx"), "utf8");
  assert.doesNotMatch(mapaSource, /en línea recta/);
  assert.match(mapaSource, /distancia directa/);
});

test("isWithinMadridBounds matches the single source of truth (MADRID_OFFLINE_PACK_BOUNDS)", () => {
  const [west, south, east, north] = MADRID_OFFLINE_PACK_BOUNDS;

  // Central Madrid (Puerta del Sol, roughly).
  assert.equal(isWithinMadridBounds({ lat: 40.4168, lng: -3.7038 }), true);

  // Just outside each of the four edges.
  assert.equal(isWithinMadridBounds({ lat: 40.4168, lng: west - 0.01 }), false);
  assert.equal(isWithinMadridBounds({ lat: 40.4168, lng: east + 0.01 }), false);
  assert.equal(isWithinMadridBounds({ lat: south - 0.01, lng: -3.7038 }), false);
  assert.equal(isWithinMadridBounds({ lat: north + 0.01, lng: -3.7038 }), false);

  // The exact corners are inclusive.
  assert.equal(isWithinMadridBounds({ lat: south, lng: west }), true);
  assert.equal(isWithinMadridBounds({ lat: south, lng: east }), true);
  assert.equal(isWithinMadridBounds({ lat: north, lng: west }), true);
  assert.equal(isWithinMadridBounds({ lat: north, lng: east }), true);
});
