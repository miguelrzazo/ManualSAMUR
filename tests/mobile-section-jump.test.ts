import assert from "node:assert/strict";
import test from "node:test";
import { createSectionJump } from "../apps/mobile/src/section-jump-logic.ts";

function fixture() {
  const locations: number[] = [];
  const offsets: number[] = [];
  const tasks = new Set<() => void>();
  let failures = 0;
  const jump = createSectionJump(
    (sectionIndex) => {
      locations.push(sectionIndex);
      if (failures-- > 0) {
        // RN supplies a flattened cell index, not the requested section index.
        jump.onScrollToIndexFailed({ index: 42, averageItemLength: 60 });
      }
    },
    (offset) => offsets.push(offset),
    (retry) => {
      tasks.add(retry);
      return () => { tasks.delete(retry); };
    },
  );
  return {
    jump, locations, offsets, tasks,
    failNext(count: number) { failures = count; },
    tick() {
      const ready = [...tasks];
      tasks.clear();
      ready.forEach((retry) => retry());
    },
  };
}

test("measured sections always use RN's section location, including return jumps", () => {
  const f = fixture();
  f.jump.jumpTo(7);
  f.jump.jumpTo(0);
  f.jump.jumpTo(7);
  assert.deepEqual(f.locations, [7, 0, 7]);
  assert.deepEqual(f.offsets, []);
  assert.equal(f.tasks.size, 0);
});

test("an offscreen letter retries the exact location after the render window catches up", () => {
  const f = fixture();
  f.failNext(2);
  f.jump.jumpTo(15);
  assert.deepEqual(f.offsets, [2520]);
  assert.equal(f.tasks.size, 1);
  f.tick();
  assert.deepEqual(f.locations, [15, 15]);
  assert.equal(f.tasks.size, 1);
  f.tick();
  assert.deepEqual(f.locations, [15, 15, 15]);
  assert.equal(f.tasks.size, 0);
});

test("a new letter tap cancels the old destination even while it is unmeasured", () => {
  const f = fixture();
  f.failNext(2);
  f.jump.jumpTo(15);
  f.jump.jumpTo(3);
  assert.equal(f.tasks.size, 1);
  f.tick();
  assert.deepEqual(f.locations, [15, 3, 3]);
  assert.equal(f.tasks.size, 0);
});

test("data changes and unmount cleanup cancel pending work and ignore unrelated failures", () => {
  const f = fixture();
  f.failNext(1);
  f.jump.jumpTo(15);
  f.jump.resetSections();
  f.jump.onScrollToIndexFailed({ index: 200, averageItemLength: 60 });
  f.tick();
  assert.deepEqual(f.locations, [15]);
  assert.deepEqual(f.offsets, [2520]);
  assert.equal(f.tasks.size, 0);
});

test("permanent layout failures stop after a bounded number of attempts", () => {
  const f = fixture();
  f.failNext(100);
  f.jump.jumpTo(15);
  for (let tick = 0; tick < 30; tick++) f.tick();
  assert.equal(f.locations.length, 20);
  assert.equal(f.tasks.size, 0);
  f.failNext(0);
  f.jump.jumpTo(2);
  assert.equal(f.locations.at(-1), 2);
});

test("missing section keys cannot issue an invalid native scroll", () => {
  const f = fixture();
  for (const index of [-1, NaN, 1.5]) f.jump.jumpTo(index);
  assert.deepEqual(f.locations, []);
});
