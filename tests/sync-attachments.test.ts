import test from "node:test";
import assert from "node:assert/strict";
import { recoverAttachmentDownload } from "../lib/sync-attachments.ts";
import type { ManualAttachment } from "../lib/manual-sync.ts";

const incoming: ManualAttachment = {
  sourceUrl: "https://servpub.madrid.es/manualsamur/bin/download/Space/WebHome/509.1_Clasificacion.pdf",
  localPath: "/docs/procedures/509/509.1_Clasificacion.pdf",
  kind: "pdf",
};
const failure = { sourceUrl: incoming.sourceUrl, localPath: incoming.localPath, error: "HTTP 404" };

test("upstream 404 preserves an existing local attachment and its candidate URL", () => {
  assert.deepEqual(recoverAttachmentDownload(incoming, [], failure, () => true), incoming);
});

test("fixing a malformed cross-page URL retains its prior cached bytes on an upstream 404", () => {
  const previous: ManualAttachment = { ...incoming, sourceUrl: "https://servpub.madrid.es/manualsamur/bin/download/Wrong/WebHome/Space.WebHome%40509.1_Clasificacion.pdf", localPath: "/docs/procedures/509/Space.WebHome-509.1_Clasificacion.pdf" };
  assert.deepEqual(recoverAttachmentDownload(incoming, [previous], failure, (local) => local === previous.localPath), { ...incoming, localPath: previous.localPath });
});

test("first-time missing assets remain explicitly unavailable without a false local reference", () => {
  const result = recoverAttachmentDownload(incoming, [], failure, () => false);
  assert.equal(result.availability, "unavailable");
  assert.equal(result.error, "HTTP 404");
  assert.equal(result.sourceUrl, incoming.sourceUrl);
});
