import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { buildCodeDatasetCandidates, codeSourceHash, CODE_SOURCE_FILES } from "../lib/code-dataset-candidates.ts";

test("#112: an implausible code candidate keeps the reviewed dataset instead of aborting the sync", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codes-"));
  try {
    fs.mkdirSync(path.join(root, "content/data"), { recursive: true });
    fs.mkdirSync(path.join(root, "public/docs/procedures/121"), { recursive: true });
    for (const file of fs.readdirSync("content/data").filter((name) => name.startsWith("codigos-")))
      fs.copyFileSync(path.join("content/data", file), path.join(root, "content/data", file));
    const previous: Record<string, string> = { procedure121: "changed-upstream" };
    for (const name of CODE_SOURCE_FILES) {
      fs.copyFileSync(path.join("public/docs/procedures/121", name), path.join(root, "public/docs/procedures/121", name));
      previous[name] = codeSourceHash(fs.readFileSync(path.join(root, "public/docs/procedures/121", name)));
    }
    // A reviewed dataset whose codes the parser can no longer find: 100 % "loss".
    const reviewed = Array.from({ length: 20 }, (_, index) => ({ code: `Curado ${index}`, name: "Revisado" }));
    fs.writeFileSync(path.join(root, "content/data/codigos-indicativos.json"), JSON.stringify(reviewed));
    const content = matter(fs.readFileSync("content/procedures/comunicaciones/121.md", "utf8")).content;
    const result = buildCodeDatasetCandidates(root, content, previous);
    assert.deepEqual(result.skipped.map((item) => item.group), ["indicativos"]);
    assert.ok(!result.candidates.has("indicativos"), "the reviewed dataset is not replaced");
    assert.ok(result.candidates.has("incidente") && result.candidates.has("pc"), "plausible groups still update");
    assert.equal(result.hashes.procedure121, "changed-upstream", "the skipped source is retried next run");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
