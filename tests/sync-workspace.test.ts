import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { withSyncWorkspace, mergeProcedureSourceFields } from "../lib/sync-workspace.ts";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sync-test-"));
  fs.mkdirSync(path.join(root, "content"));
  fs.writeFileSync(path.join(root, "content/first.json"), "original");
  return root;
}

test("a late domain failure leaves every checkout file unchanged", async () => {
  const root = fixture();
  try {
    await assert.rejects(withSyncWorkspace(root, async (candidate) => {
      fs.writeFileSync(path.join(candidate, "content/first.json"), "new upstream");
      fs.writeFileSync(path.join(candidate, "content/new.json"), "new document");
      assert.equal(fs.readFileSync(path.join(root, "content/first.json"), "utf8"), "original");
      throw new Error("last domain validation failed");
    }), /last domain/);
    assert.equal(fs.readFileSync(path.join(root, "content/first.json"), "utf8"), "original");
    assert.equal(fs.existsSync(path.join(root, "content/new.json")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a successful candidate commits additions, updates and confirmed removals", async () => {
  const root = fixture();
  try {
    fs.writeFileSync(path.join(root, "content/removed.json"), "remove");
    await withSyncWorkspace(root, async (candidate) => {
      fs.writeFileSync(path.join(candidate, "content/first.json"), "upstream");
      fs.writeFileSync(path.join(candidate, "content/new.json"), "new");
      fs.unlinkSync(path.join(candidate, "content/removed.json"));
    });
    assert.equal(fs.readFileSync(path.join(root, "content/first.json"), "utf8"), "upstream");
    assert.equal(fs.readFileSync(path.join(root, "content/new.json"), "utf8"), "new");
    assert.equal(fs.existsSync(path.join(root, "content/removed.json")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("concurrent local edits abort candidate commit", async () => {
  const root = fixture();
  try {
    await assert.rejects(withSyncWorkspace(root, async (candidate) => {
      fs.writeFileSync(path.join(candidate, "content/first.json"), "upstream");
      fs.writeFileSync(path.join(root, "content/first.json"), "editorial change");
    }), /changed during sync/);
    assert.equal(fs.readFileSync(path.join(root, "content/first.json"), "utf8"), "editorial change");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("source refresh preserves editorial identity, taxonomy, notes and approval fields", () => {
  assert.deepEqual(mergeProcedureSourceFields({ id: "123", title: "Wiki", tags: [], source: "new", contentHash: "new" }, {
    id: "123", title: "Local", tags: ["urgencias"], section: "Clínica", editorialNotes: "Revisar", lastApprovedOfficialUpdateAt: "2026-01-01", source: "old", contentHash: "old",
  }), { id: "123", title: "Local", tags: ["urgencias"], section: "Clínica", editorialNotes: "Revisar", lastApprovedOfficialUpdateAt: "2026-01-01", source: "new", contentHash: "new" });
});
