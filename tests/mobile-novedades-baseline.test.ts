import test from "node:test";
import assert from "node:assert/strict";
import { isUnreadNovedad, resolveNovedadesBaseline } from "../apps/mobile/src/preferences-logic.ts";

const now = new Date("2026-10-31T16:00:00.000Z");
// The first backend release emitted one "nuevo" event per procedure, all at publish time.
const published = Array.from({ length: 223 }, (_, i) => ({
  eventId: `19ab0247:${i}`,
  approvedAt: "2026-10-28T08:12:00.248Z",
  effectiveDate: "2026-10-28T08:12:00.248Z",
}));

test("a fresh install records its baseline and sees nothing already published as new", () => {
  const baseline = resolveNovedadesBaseline({ storedBaseline: null, storedDisclosure: null, storedSeenEvents: null, now });
  assert.equal(baseline.baselineAt, now.toISOString());
  assert.equal(baseline.persist, now.toISOString(), "the first launch writes the baseline");
  const unread = published.filter((event) => isUnreadNovedad(event, new Set(), baseline.baselineAt));
  assert.equal(unread.length, 0);
});

test("updates approved after the install still count as new, until read", () => {
  const { baselineAt } = resolveNovedadesBaseline({ storedBaseline: null, storedDisclosure: null, storedSeenEvents: null, now });
  const later = { eventId: "next:301", approvedAt: "2026-11-01T09:00:00.000Z", effectiveDate: "2026-11-01" };
  assert.equal(isUnreadNovedad(later, new Set(), baselineAt), true);
  assert.equal(isUnreadNovedad(later, new Set(["next:301"]), baselineAt), false);
});

test("the stored baseline is reused on later launches, not moved forward", () => {
  const stored = "2026-10-31T16:00:00.000Z";
  const baseline = resolveNovedadesBaseline({ storedBaseline: stored, storedDisclosure: "acknowledged", storedSeenEvents: "[]", now: new Date("2026-12-01T00:00:00.000Z") });
  assert.deepEqual(baseline, { baselineAt: stored });
});

test("existing installs keep their read state: no baseline is invented", () => {
  for (const inputs of [
    { storedDisclosure: "acknowledged", storedSeenEvents: null },
    { storedDisclosure: null, storedSeenEvents: '["19ab0247:0"]' },
  ]) {
    const baseline = resolveNovedadesBaseline({ storedBaseline: null, now, ...inputs });
    assert.deepEqual(baseline, {});
    const seen = new Set(inputs.storedSeenEvents ? ["19ab0247:0"] : []);
    const unread = published.filter((event) => isUnreadNovedad(event, seen, baseline.baselineAt));
    assert.equal(unread.length, published.length - seen.size);
  }
});

test("an event without a usable date is not reported as new after a baseline", () => {
  assert.equal(isUnreadNovedad({ eventId: "x", effectiveDate: "" }, new Set(), now.toISOString()), false);
  assert.equal(isUnreadNovedad({ eventId: "x", effectiveDate: "" }, new Set()), true);
});
