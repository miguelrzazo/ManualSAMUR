import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  filterLocations,
  hasHospitalOwnership,
  haversineDistanceMeters,
  isLocationStale,
  locationFavoriteId,
  locationPolicyReady,
  locationPolicyStatus,
  locationRecords,
  locationVisual,
  locationDisplayName,
  locationSubtitle,
  normalizeHospitalOwnership,
  locationSourcePolicy,
  locationRouteKey,
  parseLocationRouteKey,
  platformMapsUrl,
  resolveLocationRoute,
  schematicNodes,
  sortLocationsByDistance,
  type LocationRecord,
} from "../apps/mobile/src/location-logic.ts";
import { mapPinsFromLocations } from "../apps/mobile/src/online-map-logic.ts";
import { adaptivePalette } from "../packages/design-tokens/src/index.ts";

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

test("packaged locations preserve the public/private hospital split and shared visuals", () => {
  assert.equal(locations.filter((location) => location.hospitalOwnership === "public").length, 11);
  assert.equal(locations.filter((location) => location.hospitalOwnership === "private").length, 10);
  assert.equal(locations.filter((location) => location.kind === "base").length, 25);

  const publicHospital = locations.find((location) => location.id === "HGM")!;
  const privateHospital = locations.find((location) => location.id === "HRB")!;
  const base = locations.find((location) => location.id === "B0")!;
  assert.deepEqual(locationVisual(publicHospital, adaptivePalette.light), {
    label: "Hospital público",
    icon: "hospital-building",
    color: adaptivePalette.light.primary,
    wash: adaptivePalette.light.primaryWash,
  });
  assert.deepEqual(locationVisual(privateHospital, adaptivePalette.light), {
    label: "Hospital privado",
    icon: "hospital-marker",
    color: adaptivePalette.light.amber,
    wash: adaptivePalette.light.amberWash,
  });
  assert.deepEqual(locationVisual(base, adaptivePalette.light), {
    label: "Base SAMUR",
    icon: "ambulance",
    color: adaptivePalette.light.green,
    wash: adaptivePalette.light.greenWash,
  });
});

test("malformed hospital ownership remains visible without a false public/private claim", () => {
  assert.equal(normalizeHospitalOwnership("public"), "public");
  assert.equal(normalizeHospitalOwnership("private"), "private");
  assert.equal(normalizeHospitalOwnership("unknown"), undefined);
  assert.equal(hasHospitalOwnership("private", "private"), true);
  assert.equal(hasHospitalOwnership("unknown", "private"), false);
  const unknown = locationRecords({ hospitals: [{ id: "HX", lat: 40, lng: -3, type: "unknown" }], bases: [] })[0];
  assert.equal(unknown.hospitalOwnership, undefined);
  assert.deepEqual(locationVisual(unknown, adaptivePalette.light), {
    label: "Hospital",
    icon: "hospital-building",
    color: adaptivePalette.light.inkMuted,
    wash: adaptivePalette.light.surfaceMuted,
  });
});

test("online map pins carry the same hospital ownership as directory records", () => {
  const pins = mapPinsFromLocations(locations.filter((location) => ["HGM", "HRB", "B0"].includes(location.id)));
  assert.deepEqual(pins.map((pin) => [pin.id, pin.kind, pin.hospitalOwnership]), [
    ["HGM", "hospital", "public"],
    ["HRB", "hospital", "private"],
    ["B0", "base", undefined],
  ]);
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
      hospitalOwnership: location.hospitalOwnership,
      sourceDate: location.sourceDate,
      sourcePolicyApproved: location.sourcePolicyApproved,
    });
  }
});

test("owner has approved and frozen the location source, and the JSON policy matches the TS constant", () => {
  const jsonPolicy = JSON.parse(readFileSync(path.join(appRoot, "location-source-policy.json"), "utf8")) as Record<string, unknown>;
  assert.equal(locationPolicyReady(), true);
  assert.equal(locationPolicyStatus(), "ready");
  assert.equal(jsonPolicy.approved, true);
  assert.equal(jsonPolicy.frozen, true);
  // The TS constant is derived from the JSON file via a static import (not node:fs), so this
  // also guards against the two ever diverging.
  assert.equal(jsonPolicy.version, locationSourcePolicy.version);
  assert.equal(jsonPolicy.approved, locationSourcePolicy.approved);
  assert.equal(jsonPolicy.frozen, locationSourcePolicy.frozen);
  assert.equal(jsonPolicy.sourceUrl, locationSourcePolicy.sourceUrl);
  assert.equal(jsonPolicy.sourceDate, locationSourcePolicy.sourceDate);
  assert.equal(jsonPolicy.hospitalScope, locationSourcePolicy.hospitalScope);
  assert.equal(jsonPolicy.freshnessDays, locationSourcePolicy.freshnessDays);
});

test("staleness is still computed correctly for an approved, frozen policy", () => {
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
  // T5e: the Mapa directory (search, filters, "Usar mi ubicación", offline fallback
  // copy) moved out of App.tsx into its own full-screen-map module.
  const mapaSource = readFileSync(path.join(appRoot, "src/screens/MapaScreen.tsx"), "utf8");
  assert.match(mapaSource, /Usar mi ubicación/);
  assert.match(mapaSource, /requestForegroundPermissionsAsync/);
  assert.match(mapaSource, /Permiso de ubicación denegado/);
  // The offline branch used to be a schematic that placed every point at a
  // position derived from its list index, with the real directory hidden behind
  // "Vista accesible" inside the sheet. The directory is the offline view now, so
  // there is no separate accessible equivalent to name.
  assert.match(mapaSource, /<LocationDirectory/);
  assert.doesNotMatch(mapaSource, /mapPercent/, "the fabricated pin positions must not come back");
  const appSource = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  assert.match(appSource, /Abrir en Mapas/);
});

test("all location surfaces consume the shared category presentation and expose category text", () => {
  const appSource = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  const directorySource = readFileSync(path.join(appRoot, "src/components/LocationDirectory.tsx"), "utf8");
  const mapaSource = readFileSync(path.join(appRoot, "src/screens/MapaScreen.tsx"), "utf8");
  const codigosSource = readFileSync(path.join(appRoot, "src/screens/CodigosScreen.tsx"), "utf8");
  const mapViewSource = readFileSync(path.join(appRoot, "src/online-map-view.tsx"), "utf8");
  assert.match(appSource, /locationVisual/);
  assert.match(appSource, /locationTypeBadge/);
  assert.match(directorySource, /locationVisual/);
  assert.match(directorySource, /visual\.label/);
  assert.match(mapaSource, /locationVisual/);
  assert.match(codigosSource, /locationVisual/);
  assert.match(codigosSource, /normalizeHospitalOwnership/);
  assert.match(mapViewSource, /locationVisual/);
  assert.match(mapViewSource, /visual\.icon/);
});

test("location detail no longer narrates freshness in the normal case, only when a record is genuinely stale", () => {
  const appSource = readFileSync(path.join(appRoot, "App.tsx"), "utf8");
  assert.doesNotMatch(appSource, /vigente según/);
  assert.match(appSource, /locationStaleNotice/);
});

/**
 * Una base se conoce por su número, no por el barrio. La lista enseñaba
 * "El Espinillo", que es justo lo que nadie dice por radio; ahora el título es
 * "Base 1" y el barrio baja al subtítulo, sin perderse.
 */
test("una base se titula por su numero y conserva el barrio en el subtitulo", () => {
  const base = {
    kind: "base" as const, shortName: "El Espinillo", baseNumber: 1,
    address: "Av. de Orovilla, 50", district: "Villaverde", districtNumber: 17,
  };
  assert.equal(locationDisplayName(base), "Base 1");
  assert.equal(locationSubtitle(base), "El Espinillo · Av. de Orovilla, 50 · Villaverde (17)");
});

test("la base 0 es la Sede Central y no se llama 'Base 0'", () => {
  const sede = {
    kind: "base" as const, shortName: "Sede Central", baseNumber: 0,
    address: "Ronda de las Provincias, 7", district: "Moncloa-Aravaca", districtNumber: 9,
  };
  assert.equal(locationDisplayName(sede), "Sede Central");
  // Sin número de base no se repite el nombre en el subtítulo.
  assert.equal(locationSubtitle(sede), "Ronda de las Provincias, 7 · Moncloa-Aravaca (9)");
});

test("un hospital mantiene su nombre y lleva el numero de distrito", () => {
  const hospital = {
    kind: "hospital" as const, shortName: "La Paz",
    address: "P.º de la Castellana, 261", district: "Fuencarral-El Pardo", districtNumber: 8,
  };
  assert.equal(locationDisplayName(hospital), "La Paz");
  assert.equal(locationSubtitle(hospital), "P.º de la Castellana, 261 · Fuencarral-El Pardo (8)");
});

test("fuera de Madrid no se inventa un numero de distrito", () => {
  const getafe = {
    kind: "hospital" as const, shortName: "Getafe",
    address: "Ctra. de Toledo, km 12,500", district: "Getafe",
  };
  assert.equal(locationSubtitle(getafe), "Ctra. de Toledo, km 12,500 · Getafe");
});

test("los datos reales traen numero de distrito en Madrid y no fuera", () => {
  const bases = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/bases.json"), "utf8")) as Array<Record<string, unknown>>;
  const hospitals = JSON.parse(readFileSync(path.join(process.cwd(), "content/data/hospitals.json"), "utf8")) as Array<Record<string, unknown>>;

  for (const base of bases) {
    assert.equal(typeof base.districtNumber, "number", `la base ${base.id} no tiene numero de distrito`);
    assert.ok((base.districtNumber as number) >= 1 && (base.districtNumber as number) <= 21);
  }
  const sinNumero = hospitals.filter((hospital) => hospital.districtNumber === undefined);
  assert.deepEqual(sinNumero.map((hospital) => hospital.district), ["Getafe"], "solo Getafe queda sin numero: no es distrito de Madrid");
});
