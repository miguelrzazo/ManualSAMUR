import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const layoutSource = readFileSync(path.join(root, "app/layout.tsx"), "utf8");
const globalsSource = readFileSync(path.join(root, "app/globals.css"), "utf8");

test("web layout has no build-time Google font loader", () => {
  assert.doesNotMatch(layoutSource, /next\/font\/google/);
  assert.doesNotMatch(layoutSource, /\bGeist(?:_Mono)?\b/);
  assert.match(globalsSource, /--font-sans:\s*system-ui/);
  assert.match(globalsSource, /--font-mono:\s*ui-monospace/);
});
