import test from "node:test";
import assert from "node:assert/strict";

import { nearestHospital } from "../apps/mobile/lib/facilities.ts";
import { toggleFavouriteId } from "../apps/mobile/lib/favourites.ts";
import { matchesSearch } from "../apps/mobile/lib/search.ts";

test("mobile search matches accented clinical terms without accent sensitivity", () => {
  assert.equal(matchesSearch("Ácido acetilsalicílico", "acido"), true);
  assert.equal(matchesSearch("Parada cardiorrespiratoria", "hospital"), false);
});

test("mobile favourites toggle a procedure id without losing the remaining ids", () => {
  assert.deepEqual(toggleFavouriteId(["301", "302"], "301"), ["302"]);
  assert.deepEqual(toggleFavouriteId(["302"], "301"), ["302", "301"]);
});

test("nearestHospital selects the closest public facility", () => {
  const result = nearestHospital({ latitude: 40.42, longitude: -3.70 }, [
    { id: "private", name: "Privado", address: "x", district: "x", lat: 40.421, lng: -3.701, type: "private" },
    { id: "far", name: "Lejano", address: "x", district: "x", lat: 40.47, lng: -3.70, type: "public" },
    { id: "near", name: "Cercano", address: "x", district: "x", lat: 40.421, lng: -3.701, type: "public" },
  ]);
  assert.equal(result?.hospital.id, "near");
  assert.ok((result?.distanceKm ?? Infinity) < 1);
});
