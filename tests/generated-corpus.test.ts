import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { copyProceduresMd, type ProcedureMeta } from "../scripts/generate-llms.ts";
import { assertConfirmedWithdrawal } from "../lib/sync-guards.ts";

test("public export reconciles withdrawals and is repeatable without deleting other assets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "samur-export-"));
  try {
    fs.writeFileSync(path.join(dir, "old.md"), "withdrawn");
    fs.writeFileSync(path.join(dir, "keep.pdf"), "asset");
    const procedure: ProcedureMeta = { id: "101", title: "Example", section: "General", slug: "101-example", updated: "2026-09-07", content: "Example content", filePath: "101.md" };
    copyProceduresMd([procedure], dir);
    const first = fs.readFileSync(path.join(dir, "101.md"), "utf8");
    copyProceduresMd([procedure], dir);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["101.md", "keep.pdf"]);
    assert.equal(fs.readFileSync(path.join(dir, "101.md"), "utf8"), first);
    assert.throws(() => copyProceduresMd([], dir), /empty dataset/);
    assert.throws(() => copyProceduresMd([procedure, procedure], dir), /duplicate/);
    assert.equal(fs.readFileSync(path.join(dir, "101.md"), "utf8"), first);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("withdrawals require upstream 404 or 410, never index absence or provider failures", () => {
  for (const status of [404, 410]) assert.doesNotThrow(() => assertConfirmedWithdrawal(status, "https://example.test/procedure"));
  for (const status of [200, 204, 301, 401, 403, 429, 500, 503]) assert.throws(() => assertConfirmedWithdrawal(status, "https://example.test/procedure"), /not confirmed/);
});
