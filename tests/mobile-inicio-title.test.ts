import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const inicioSource = readFileSync(
  path.join(process.cwd(), "apps/mobile/src/screens/InicioScreen.tsx"),
  "utf8",
);
const appSource = readFileSync(
  path.join(process.cwd(), "apps/mobile/App.tsx"),
  "utf8",
);

test("Inicio uses the exact Manual title", () => {
  assert.match(inicioSource, /<Text style=\{styles\.treeHeadingText\}>Manual<\/Text>/);
  assert.doesNotMatch(inicioSource, /Manual de procedimientos/);
  assert.doesNotMatch(inicioSource, /Manual SAMUR/);
  assert.match(appSource, /function BrandHeader[\s\S]*?title="Manual"/);
});
