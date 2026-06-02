import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("sync:manualsamur:apply uses ts-node and avoids unsupported strip-types flag", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
    scripts?: Record<string, string>;
  };

  const script = pkg.scripts?.["sync:manualsamur:apply"] ?? "";
  assert.match(script, /\bts-node\b/);
  assert.doesNotMatch(script, /--experimental-strip-types/);
});
