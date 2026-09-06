import test from "node:test";
import assert from "node:assert/strict";
import {
  initialOfflineMapPackState,
  MADRID_OFFLINE_PACK_BOUNDS,
  MADRID_OFFLINE_PACK_ID,
  MADRID_OFFLINE_PACK_MAX_ZOOM,
  MADRID_OFFLINE_PACK_MIN_ZOOM,
  offlineMapPackCanDownload,
  offlineMapPackIsReady,
  offlineMapPackLabel,
  transitionOfflineMapPackState,
} from "../apps/mobile/src/offline-map-pack-logic.ts";

test("the Madrid offline pack has a stable identity and a real bounding box around the city", () => {
  assert.equal(MADRID_OFFLINE_PACK_ID, "madrid-samur-basemap");
  const [west, south, east, north] = MADRID_OFFLINE_PACK_BOUNDS;
  assert.ok(west < east);
  assert.ok(south < north);
  // Madrid's municipality sits well inside this box.
  assert.ok(west < -3.7 && -3.7 < east);
  assert.ok(south < 40.4 && 40.4 < north);
  assert.ok(MADRID_OFFLINE_PACK_MIN_ZOOM < MADRID_OFFLINE_PACK_MAX_ZOOM);
});

test("the offline pack state machine starts unknown and only reaches ready via a check or a completed download", () => {
  assert.equal(initialOfflineMapPackState.status, "unknown");
  assert.equal(offlineMapPackIsReady(initialOfflineMapPackState), false);

  const checking = transitionOfflineMapPackState(initialOfflineMapPackState, { type: "check-start" });
  assert.equal(checking.status, "checking");

  const foundReady = transitionOfflineMapPackState(checking, { type: "check-found-ready" });
  assert.equal(offlineMapPackIsReady(foundReady), true);
  assert.equal(offlineMapPackCanDownload(foundReady), false);

  const foundAbsent = transitionOfflineMapPackState(checking, { type: "check-found-absent" });
  assert.equal(offlineMapPackCanDownload(foundAbsent), true);

  const downloading = transitionOfflineMapPackState(foundAbsent, { type: "download-start" });
  assert.equal(downloading.status, "downloading");
  assert.equal(offlineMapPackCanDownload(downloading), false);

  const midway = transitionOfflineMapPackState(downloading, { type: "progress", percentage: 42 });
  assert.equal(midway.percentage, 42);

  const complete = transitionOfflineMapPackState(midway, { type: "download-complete" });
  assert.equal(offlineMapPackIsReady(complete), true);
  assert.equal(complete.percentage, 100);
});

test("progress percentage is clamped to a sane 0-100 range", () => {
  const state = transitionOfflineMapPackState(initialOfflineMapPackState, { type: "progress", percentage: 150 });
  assert.equal(state.percentage, 100);
  const negative = transitionOfflineMapPackState(initialOfflineMapPackState, { type: "progress", percentage: -20 });
  assert.equal(negative.percentage, 0);
});

test("a download error is recoverable: it can be retried, and it reports the message", () => {
  const downloading = transitionOfflineMapPackState(initialOfflineMapPackState, { type: "download-start" });
  const failed = transitionOfflineMapPackState(downloading, { type: "download-error", message: "sin conexión" });
  assert.equal(failed.status, "error");
  assert.equal(failed.errorMessage, "sin conexión");
  assert.equal(offlineMapPackCanDownload(failed), true);
  assert.match(offlineMapPackLabel(failed), /sin conexión/);
});

test("pack labels are Spanish, human copy for every state", () => {
  for (const state of [
    initialOfflineMapPackState,
    transitionOfflineMapPackState(initialOfflineMapPackState, { type: "check-start" }),
    transitionOfflineMapPackState(initialOfflineMapPackState, { type: "check-found-absent" }),
    transitionOfflineMapPackState(initialOfflineMapPackState, { type: "download-start" }),
    transitionOfflineMapPackState(initialOfflineMapPackState, { type: "check-found-ready" }),
  ]) {
    assert.equal(typeof offlineMapPackLabel(state), "string");
    assert.ok(offlineMapPackLabel(state).length > 0);
  }
  assert.match(offlineMapPackLabel(transitionOfflineMapPackState(initialOfflineMapPackState, { type: "check-found-ready" })), /guardado en el dispositivo/);
});
