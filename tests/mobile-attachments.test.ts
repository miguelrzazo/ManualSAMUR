import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_ATTACHMENT_RELEASE_POLICY,
  ESSENTIAL_ATTACHMENT_CAP_BYTES,
  V1_INSTALLED_ATTACHMENT_CAP_BYTES,
  attachmentDownloadFilename,
  attachmentStatusLabel,
  assertAttachmentReleaseReady,
  createAttachmentRecord,
  evaluateAttachmentRelease,
  isExpectedAttachmentMetadata,
  isLocallyAvailable,
  markAttachmentAvailable,
  markAttachmentFailed,
  recoverAttachment,
  startAttachmentDownload,
  updateAttachmentProgress,
  type AttachmentRecord,
} from "../apps/mobile/src/attachment-logic.ts";
import type { MobileManifestAttachment } from "../apps/mobile/src/data/schema.ts";

const sha256 = "a".repeat(64);
const attachment: MobileManifestAttachment = {
  id: "attachment-1",
  sourceUrl: "https://example.test/manual.pdf",
  localPath: "/docs/procedures/301/manual.pdf",
  filename: "manual.pdf",
  kind: "pdf",
  byteLength: 1024,
  sha256,
  procedureId: "301",
};

test("attachment identity is stable and does not use the mutable source URL as a filename", () => {
  assert.equal(attachmentDownloadFilename(attachment), "attachment-1-manual.pdf");
  assert.equal(attachmentStatusLabel("not-downloaded"), "Disponible bajo demanda");
  assert.equal(attachmentStatusLabel("paused"), "Descarga interrumpida");
  assert.equal(isExpectedAttachmentMetadata(attachment), true);
  assert.equal(isExpectedAttachmentMetadata({ ...attachment, sha256: "bad" }), false);
});

test("attachment records move through progress and verified availability states", () => {
  const initial = createAttachmentRecord(attachment, "2026-09-05T10:00:00.000Z");
  const downloading = startAttachmentDownload(initial, "2026-09-05T10:01:00.000Z");
  const progress = updateAttachmentProgress(downloading, 512, 1024, "2026-09-05T10:02:00.000Z");
  const available = markAttachmentAvailable(progress, { localUri: "file:///documents/attachment-1-manual.pdf", byteLength: 1024, sha256 }, attachment, "2026-09-05T10:03:00.000Z");
  assert.equal(available.status, "available");
  assert.equal(available.localUri, "file:///documents/attachment-1-manual.pdf");
  assert.equal(isLocallyAvailable(available, attachment), true);
  assert.throws(() => markAttachmentAvailable(progress, { localUri: "file:///bad", byteLength: 1023, sha256 }, attachment, "2026-09-05T10:03:00.000Z"), /SHA-256/);
  assert.equal(markAttachmentFailed(progress, "HTTP 503", "2026-09-05T10:04:00.000Z").status, "failed");
});

test("interrupted downloads recover as retryable and missing available files never stay available", () => {
  const record = startAttachmentDownload(createAttachmentRecord(attachment, "2026-09-05T10:00:00.000Z"), "2026-09-05T10:01:00.000Z");
  const paused = recoverAttachment(record, true, "2026-09-05T10:05:00.000Z");
  assert.equal(paused.status, "paused");
  const missing = recoverAttachment({ ...paused, status: "available", localUri: "file:///gone" }, false, "2026-09-05T10:06:00.000Z");
  assert.equal(missing.status, "failed");
  assert.equal(missing.localUri, undefined);
  assert.equal(isLocallyAvailable(missing, attachment), false);
});

test("release freeze is blocked by the unapproved empty policy and by missing essential assets", () => {
  const report = evaluateAttachmentRelease([attachment], DEFAULT_ATTACHMENT_RELEASE_POLICY, {});
  assert.equal(report.ready, false);
  assert.equal(report.issues[0]?.code, "policy-unapproved");
  assert.throws(() => assertAttachmentReleaseReady(report), /bloqueada/);
  const approved = evaluateAttachmentRelease([attachment], { version: 1, approved: true, essentialAttachmentIds: [attachment.id], approvalReference: "owner-approval" }, { [attachment.id]: { bundled: true } });
  assert.equal(approved.ready, true);
  assert.equal(approved.essentialBytes, 1024);
});

test("release policy enforces the approved size caps", () => {
  const essential = { ...attachment, byteLength: ESSENTIAL_ATTACHMENT_CAP_BYTES + 1 };
  const essentialReport = evaluateAttachmentRelease([essential], { version: 1, approved: true, essentialAttachmentIds: [essential.id] }, { [essential.id]: { bundled: true } });
  assert.equal(essentialReport.issues.some((issue) => issue.code === "essential-cap-exceeded"), true);

  const first = { ...attachment, id: "first", byteLength: V1_INSTALLED_ATTACHMENT_CAP_BYTES };
  const second = { ...attachment, id: "second", byteLength: 1 };
  const totalReport = evaluateAttachmentRelease([first, second], { version: 1, approved: true, essentialAttachmentIds: [] }, { first: { bundled: true }, second: { downloaded: true } });
  assert.equal(totalReport.issues.some((issue) => issue.code === "installed-cap-exceeded"), true);
});
