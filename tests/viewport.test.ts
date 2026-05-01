import test from "node:test";
import assert from "node:assert/strict";

import { getPreferredViewportHeight, syncViewportHeightVar } from "../lib/viewport.ts";

test("getPreferredViewportHeight prefers visualViewport height when available", () => {
  assert.equal(
    getPreferredViewportHeight({
      innerHeight: 844,
      visualViewport: { height: 712 },
    }),
    712,
  );
});

test("getPreferredViewportHeight falls back to innerHeight when visualViewport is unavailable", () => {
  assert.equal(
    getPreferredViewportHeight({
      innerHeight: 844,
      visualViewport: null,
    }),
    844,
  );
});

test("syncViewportHeightVar writes a pixel value to the root element", () => {
  const properties = new Map<string, string>();

  const value = syncViewportHeightVar(
    {
      documentElement: {
        style: {
          setProperty(name: string, propertyValue: string) {
            properties.set(name, propertyValue);
          },
        },
      },
    },
    {
      innerHeight: 915.3,
      visualViewport: { height: 914.6 },
    },
  );

  assert.equal(value, "915px");
  assert.equal(properties.get("--app-viewport-height"), "915px");
});
