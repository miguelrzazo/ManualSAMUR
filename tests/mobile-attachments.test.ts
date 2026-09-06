import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ATTACHMENT_RELEASE_POLICY,
  ESSENTIAL_ATTACHMENT_CAP_BYTES,
  V1_INSTALLED_ATTACHMENT_CAP_BYTES,
  attachmentDownloadFilename,
  attachmentStatusLabel,
  attachmentUnavailableUpstreamNotice,
  assertAttachmentReleaseReady,
  createAttachmentRecord,
  evaluateAttachmentRelease,
  isAttachmentUnavailableUpstream,
  isExpectedAttachmentMetadata,
  isLocallyAvailable,
  isViewableInApp,
  markAttachmentAvailable,
  rendersInline,
  markAttachmentFailed,
  recoverAttachment,
  startAttachmentDownload,
  updateAttachmentProgress,
  type AttachmentReleasePolicy,
  type AttachmentRecord,
} from "../apps/mobile/src/attachment-logic.ts";
import type { MobileAttachmentManifest, MobileManifestAttachment } from "../apps/mobile/src/data/schema.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobileAppRoot = path.join(repositoryRoot, "apps/mobile");
const realManifest: MobileAttachmentManifest = JSON.parse(
  fs.readFileSync(path.join(mobileAppRoot, "src/data/attachment-manifest.json"), "utf8"),
);
const realPolicy: AttachmentReleasePolicy = JSON.parse(
  fs.readFileSync(path.join(mobileAppRoot, "attachment-release-policy.json"), "utf8"),
);
const realResolvableIds = realManifest.attachments
  .filter((candidate) => isExpectedAttachmentMetadata(candidate))
  .map((candidate) => candidate.id)
  .sort();
const realUnresolvableAttachments = realManifest.attachments.filter((candidate) => !isExpectedAttachmentMetadata(candidate));

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

test("an attachment with no approved byteLength/sha256 is permanently unavailable, never locally reportable", () => {
  const unresolved = { ...attachment, byteLength: undefined, sha256: undefined };
  assert.equal(isAttachmentUnavailableUpstream(unresolved), true);
  assert.equal(isAttachmentUnavailableUpstream(attachment), false);
  assert.match(attachmentUnavailableUpstreamNotice(unresolved), /fuente oficial/);
  assert.match(attachmentUnavailableUpstreamNotice(unresolved), new RegExp(unresolved.filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // No matter what a corrupted/legacy record claims, it can never read back as locally available.
  const bogusAvailableRecord: AttachmentRecord = {
    id: unresolved.id,
    sourceUrl: unresolved.sourceUrl,
    localPath: unresolved.localPath,
    filename: unresolved.filename,
    kind: unresolved.kind,
    status: "available",
    localUri: "file:///should-not-exist",
    byteLength: 999,
    sha256: "b".repeat(64),
    updatedAt: "2026-09-05T00:00:00.000Z",
  };
  assert.equal(isLocallyAvailable(bogusAvailableRecord, unresolved), false);
});

test("real attachment-release-policy.json (issue #62): owner approved bundling all resolvable attachments", () => {
  assert.equal(realPolicy.approved, true, "the owner decision to bundle every resolvable attachment must be recorded as approved");
  assert.equal(realPolicy.version, 1);
  assert.ok(realPolicy.essentialAttachmentIds.length > 0);
  assert.match(realPolicy.notes ?? "", /esencial/i);
  assert.match(realPolicy.notes ?? "", /404/);
});

test("real essential allowlist matches exactly the manifest's resolvable attachments", () => {
  assert.deepEqual([...realPolicy.essentialAttachmentIds].sort(), realResolvableIds);
  // Nothing in the allowlist may lack the metadata required to ever be marked available.
  const byId = new Map(realManifest.attachments.map((candidate) => [candidate.id, candidate]));
  for (const id of realPolicy.essentialAttachmentIds) {
    assert.equal(isExpectedAttachmentMetadata(byId.get(id)!), true, `essential attachment ${id} is missing byteLength/sha256`);
  }
});

test("real manifest: exactly 8 attachments are excluded as gone upstream, and none of them can ever read back as local", () => {
  assert.equal(realUnresolvableAttachments.length, 8);
  for (const candidate of realUnresolvableAttachments) {
    assert.equal(realPolicy.essentialAttachmentIds.includes(candidate.id), false, `${candidate.id} must not be in the essential allowlist`);
    assert.equal(isAttachmentUnavailableUpstream(candidate), true);
    assert.equal(isLocallyAvailable({ ...createAttachmentRecord(candidate, "2026-09-05T00:00:00.000Z"), status: "available", localUri: "file:///anything", byteLength: 1, sha256: "c".repeat(64) }, candidate), false);
  }
});

test("real essential set (bundled offline attachments) stays under the 75 MB essential cap", () => {
  const byId = new Map(realManifest.attachments.map((candidate) => [candidate.id, candidate]));
  const availability = Object.fromEntries(realPolicy.essentialAttachmentIds.map((id) => [id, { bundled: true }]));
  const report = evaluateAttachmentRelease(realManifest.attachments, realPolicy, availability);
  assert.equal(report.ready, true, report.issues.map((issue) => issue.detail).join(" "));
  assert.ok(report.essentialBytes <= ESSENTIAL_ATTACHMENT_CAP_BYTES, `essential bytes ${report.essentialBytes} exceed the ${ESSENTIAL_ATTACHMENT_CAP_BYTES} cap`);
  assert.ok(report.installedBytes <= V1_INSTALLED_ATTACHMENT_CAP_BYTES);
  const expectedTotal = realPolicy.essentialAttachmentIds.reduce((total, id) => total + (byId.get(id)?.byteLength ?? 0), 0);
  assert.equal(report.essentialBytes, expectedTotal);
});

test("images render inline in the procedure; PDFs stay a list that opens in the viewer", () => {
  const images = realManifest.attachments.filter(rendersInline);
  const documents = realManifest.attachments.filter((candidate) => !rendersInline(candidate));
  // Both halves are substantial — this split is not theoretical.
  assert.ok(images.length > 100, `expected the package to carry many figures, got ${images.length}`);
  assert.ok(documents.length > 100, `expected the package to carry many documents, got ${documents.length}`);
  assert.equal(images.length + documents.length, realManifest.attachments.length, "every anexo lands on exactly one side");
  for (const image of images) assert.equal(image.kind, "image");
  for (const document of documents) assert.notEqual(document.kind, "image");
});

test("only anexos that still exist upstream are offered to the in-app viewer", () => {
  // The eight confirmed-gone anexos keep the external official source as their only route:
  // there is nothing local to render, and pretending otherwise would show an empty viewer.
  for (const gone of realManifest.attachments.filter(isAttachmentUnavailableUpstream)) {
    assert.equal(isViewableInApp(gone), false, `${gone.filename} has no local bytes to show`);
  }
  const viewable = realManifest.attachments.filter(isViewableInApp);
  assert.ok(viewable.length > 0);
  for (const candidate of viewable) assert.ok(candidate.kind === "pdf" || candidate.kind === "image");
});

test("the anexo viewer never renders a remote url — it renders the local file or nothing", () => {
  const viewer = fs.readFileSync(path.join(mobileAppRoot, "src/screens/AnexoScreen.tsx"), "utf8");
  // `record.localUri` is the only thing handed to <Pdf> and <Image>; `sourceUrl` appears
  // exactly once, behind the error branch, as an explicit "abrir fuente oficial" link.
  assert.match(viewer, /source=\{\{ uri \}\}/);
  assert.match(viewer, /const uri = record\?\.localUri/);
  assert.equal((viewer.match(/attachment\.sourceUrl/g) ?? []).length, 1);
  assert.match(viewer, /Linking\.openURL\(attachment\.sourceUrl\)/);
  assert.match(viewer, /accessibilityRole="link"/);
});
