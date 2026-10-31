import test from "node:test";
import assert from "node:assert/strict";
import { createHandoffRouteSource } from "../apps/mobile/src/handoff-route-source.ts";

const inicio = { name: "Inicio" };
const procedure = { name: "Procedure", params: { id: "301" } };
const drug = { name: "Drug", params: { id: "adrenalina" } };

test("the root route is advertised while no pane holds the slot", () => {
  const source = createHandoffRouteSource();
  assert.deepEqual(source.resolve(inicio), inicio);
  assert.equal(source.paneRoute(), undefined);
});

test("a visible pane's detail wins over the root tab, and releasing restores the root", () => {
  const source = createHandoffRouteSource();
  let changes = 0;
  source.subscribe(() => { changes += 1; });
  const pane = source.claim();
  // Not ready yet: the root route still shows.
  assert.deepEqual(source.resolve(inicio), inicio);
  pane.update(procedure);
  assert.deepEqual(source.resolve(inicio), procedure);
  pane.update({ name: "Procedure", params: { id: "301" } });
  assert.equal(changes, 1, "an identical route does not re-publish");
  pane.release();
  assert.deepEqual(source.resolve(inicio), inicio);
  assert.equal(changes, 2);
});

test("a stale pane cannot clear or overwrite the newer pane's route", () => {
  const source = createHandoffRouteSource();
  const oldPane = source.claim();
  oldPane.update(procedure);
  const newPane = source.claim();
  newPane.update(drug);
  oldPane.update(procedure);
  oldPane.release();
  assert.deepEqual(source.resolve(inicio), drug);
  newPane.release();
  assert.deepEqual(source.resolve(inicio), inicio);
});

test("unsubscribed listeners stop hearing changes", () => {
  const source = createHandoffRouteSource();
  let changes = 0;
  const unsubscribe = source.subscribe(() => { changes += 1; });
  unsubscribe();
  source.claim().update(procedure);
  assert.equal(changes, 0);
});
