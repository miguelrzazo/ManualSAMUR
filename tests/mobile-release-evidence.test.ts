import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  compareCurrentProvenance,
  RELEASE_GATE_IDS,
  createInternalTestHandoff,
  createReleaseEvidence,
  validateReleaseEvidence,
  type ReleaseEvidence,
} from "../apps/mobile/src/release-evidence.ts";
import type { MobileSnapshot } from "../apps/mobile/src/data/schema.ts";

const root = process.cwd();
const appRoot = path.join(root, "apps/mobile");
const snapshot = JSON.parse(readFileSync(path.join(appRoot, "src/data/snapshot.json"), "utf8")) as MobileSnapshot;
const provenance = {
  commitSha: "0123456789abcdef0123456789abcdef01234567",
  ref: "refs/heads/codex/mobile-app-wayfinder",
  buildId: "ci-123-1",
  workflowRunId: "123",
  nodeVersion: "v22.13.0",
  expoVersion: "57.0.20",
  package: { schema: snapshot.schema, version: snapshot.version, generatedAt: snapshot.generatedAt, contentHash: snapshot.hash, packageHash: snapshot.packageHash ?? "" },
};

function completeEvidence(): ReleaseEvidence {
  const evidence = createReleaseEvidence(snapshot, provenance, "2026-09-05T00:00:00.000Z");
  for (const id of RELEASE_GATE_IDS) evidence.gates[id] = { ...evidence.gates[id], status: "pass", referenceDevice: "both", measuredAt: "2026-09-05T00:00:00.000Z", artifact: `artifacts/${id}.json`, measurements: { observed: true }, notes: "Synthetic test fixture; replace with owner evidence." };
  evidence.referenceDevices.ios = { platform: "ios", approved: true, model: "iPhone reference", os: "iOS 27", approvalReference: "owner-device-approval", approvedBy: "owner" };
  evidence.referenceDevices.android = { platform: "android", approved: true, model: "Android reference", os: "Android 16", approvalReference: "owner-device-approval", approvedBy: "owner" };
  evidence.fieldValidation = { status: "pass", checklist: "apps/mobile/release/field-validation-checklist.md", phiProhibited: true, completedBy: "owner", completedAt: "2026-09-05T00:00:00.000Z" };
  evidence.ownerGates = { attachments: "approved", locations: "approved", onlineMap: "approved", accessibility: "approved" };
  evidence.humanReview = { status: "complete", checklist: "apps/mobile/release/human-review-checklist.md", completedBy: "owner", completedAt: "2026-09-05T00:00:00.000Z" };
  evidence.internalTestDecision = { status: "approved", decidedBy: "owner", decidedAt: "2026-09-05T00:00:00.000Z" };
  evidence.signing = { ios: "provided", android: "provided", iosArtifact: "artifacts/app.ipa", androidArtifact: "artifacts/app.aab", iosSha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef", androidSha256: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789", iosBytes: 100, androidBytes: 200, iosSignedAt: "2026-09-05T00:00:00.000Z", androidSignedAt: "2026-09-05T00:00:00.000Z", owner: "owner" };
  evidence.status = "ready";
  evidence.productionDecision = { submission: "required", rollout: "required", halt: "required", rollback: "required" };
  return evidence;
}

test("release evidence starts blocked but normal CI collection remains useful", () => {
  const evidence = createReleaseEvidence(snapshot, provenance, "2026-09-05T00:00:00.000Z");
  const validation = validateReleaseEvidence(evidence);
  assert.equal(evidence.status, "blocked");
  assert.equal(validation.ready, false);
  assert.match(evidence.generatedAt, /^2026-09-05T/);
  assert.ok(validation.issues.some((issue) => issue.includes("signing")));
});

test("strict release readiness requires every matrix gate, provenance, device and owner artifact", () => {
  const ready = completeEvidence();
  assert.deepEqual(validateReleaseEvidence(ready, true), { ready: true, issues: [] });
  const missingMeasurement = completeEvidence();
  missingMeasurement.gates.performance.artifact = null;
  assert.equal(validateReleaseEvidence(missingMeasurement, true).ready, false);
  const emptyMeasurements = completeEvidence();
  emptyMeasurements.gates.performance.measurements = {};
  assert.equal(validateReleaseEvidence(emptyMeasurements, true).ready, false);
  const pendingGate = completeEvidence();
  pendingGate.gates.performance.status = "pending";
  assert.equal(validateReleaseEvidence(pendingGate, true).ready, false);
  const failedGate = completeEvidence();
  failedGate.gates.performance.status = "fail";
  assert.equal(validateReleaseEvidence(failedGate, true).ready, false);
  const notApplicableGate = completeEvidence();
  notApplicableGate.gates.performance.status = "not-applicable";
  notApplicableGate.gates.performance.notes = "No exemption is allowed by the release matrix.";
  assert.equal(validateReleaseEvidence(notApplicableGate, true).ready, false);
  const incompleteHumanReview = completeEvidence();
  incompleteHumanReview.humanReview = { ...incompleteHumanReview.humanReview, status: "pending" };
  assert.equal(validateReleaseEvidence(incompleteHumanReview, true).ready, false);
  const missingInternalApproval = completeEvidence();
  missingInternalApproval.internalTestDecision = { status: "required", decidedBy: null, decidedAt: null };
  assert.equal(validateReleaseEvidence(missingInternalApproval, true).ready, false);
  const productionApproval = completeEvidence();
  productionApproval.productionDecision = { submission: "approved", rollout: "approved", halt: "approved", rollback: "approved" } as ReleaseEvidence["productionDecision"];
  assert.equal(validateReleaseEvidence(productionApproval, true).ready, false);
  const missingSigningMetadata = completeEvidence();
  missingSigningMetadata.signing.iosSha256 = null;
  missingSigningMetadata.signing.androidBytes = null;
  assert.equal(validateReleaseEvidence(missingSigningMetadata, true).ready, false);
  const unapprovedDevice = completeEvidence();
  unapprovedDevice.referenceDevices.ios.approved = false;
  assert.equal(validateReleaseEvidence(unapprovedDevice, true).ready, false);
  unapprovedDevice.gates.performance.referenceDevice = null;
  assert.equal(validateReleaseEvidence(unapprovedDevice, true).ready, false);
});

test("handoff is prepared for human upload but never becomes an automated submission", () => {
  const handoff = createInternalTestHandoff(createReleaseEvidence(snapshot, provenance, "2026-09-05T00:00:00.000Z"), "artifacts/mobile-release-evidence.json");
  assert.equal(handoff.status, "blocked");
  assert.equal(handoff.easConfig.path, "apps/mobile/eas.json");
  assert.equal(handoff.easConfig.internalDistributionProfile, "preview");
  assert.equal(handoff.candidates.ios.signed, false);
  assert.equal(handoff.candidates.android.signed, false);
  assert.ok(handoff.humanActions.some((action) => action.includes("manualmente")));
  assert.ok(handoff.nonActions.some((action) => action.includes("no sube")));
  const completeHandoff = createInternalTestHandoff(completeEvidence(), "artifacts/mobile-release-evidence.json");
  assert.equal(completeHandoff.status, "ready-for-human-upload");
  assert.equal(completeHandoff.candidates.ios.signed, true);
  assert.equal(completeHandoff.candidates.android.signed, true);
});

test("matrix, schema and synthetic checklist cover every hard evidence surface", () => {
  const matrix = JSON.parse(readFileSync(path.join(appRoot, "release/evidence-matrix.json"), "utf8")) as { requiredGates: Array<{ id: string }>; finalDecision: string; allowNotApplicable: boolean };
  const schema = JSON.parse(readFileSync(path.join(appRoot, "release/evidence-schema.json"), "utf8")) as { required: string[]; properties: { gates: { required: string[] } } };
  const checklist = readFileSync(path.join(appRoot, "release/field-validation-checklist.md"), "utf8");
  assert.deepEqual(matrix.requiredGates.map((gate) => gate.id), [...RELEASE_GATE_IDS]);
  assert.equal(matrix.allowNotApplicable, false);
  assert.deepEqual(schema.properties.gates.required, [...RELEASE_GATE_IDS]);
  assert.ok(schema.required.includes("humanReview"));
  assert.ok(schema.required.includes("internalTestDecision"));
  assert.ok(schema.required.includes("productionDecision"));
  assert.equal(matrix.finalDecision, "human-only");
  assert.match(checklist, /PHI/i);
  assert.match(checklist, /Synthetic/i);
  assert.match(checklist, /location permission/i);
  assert.match(checklist, /failed.*update/i);
});

test("CI runs validation and retains dated evidence without store deployment commands", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/ci.yml"), "utf8");
  assert.match(workflow, /npm run mobile:content/);
  assert.match(workflow, /npm run mobile:content:validate/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run mobile:typecheck/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /upload-artifact@v4\.6\.2/);
  assert.match(workflow, /retention-days: 30/);
  assert.match(workflow, /MOBILE_EVIDENCE_TIMESTAMP/);
  assert.doesNotMatch(workflow, /\b(?:eas\s+(?:submit|update|upload)|fastlane\s+(?:deliver|pilot|release)|gradle\s+publish|xcrun\s+altool|gh\s+release|upload-testflight|google-play-publish)\b/i);
  assert.doesNotMatch(workflow, /uses:.*(?:apple-actions|google-github-actions).*store/i);
});

test("EAS config exposes only a human-controlled internal distribution profile", () => {
  const eas = JSON.parse(readFileSync(path.join(appRoot, "eas.json"), "utf8")) as { build: Record<string, { distribution?: string }> };
  assert.equal(eas.build.preview.distribution, "internal");
  assert.equal(eas.build.development.distribution, "internal");
  assert.equal(readFileSync(path.join(appRoot, "release/human-review-checklist.md"), "utf8").includes("human"), true);
});

test("completed evidence can be validated against the current provenance", () => {
  const currentSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const current = completeEvidence();
  current.provenance.commitSha = currentSha;
  current.provenance.nodeVersion = process.version;
  current.provenance.expoVersion = "57.0.20";
  assert.deepEqual(compareCurrentProvenance(current.provenance, { ...current.provenance, buildId: "new-build" }), []);
  const stale = { ...current.provenance, commitSha: "fedcba9876543210fedcba9876543210fedcba98" };
  assert.ok(compareCurrentProvenance(stale, current.provenance).some((issue) => issue.includes("otro commit")));
});

test("collector accepts a completed current input and rejects stale provenance in strict mode", () => {
  const temp = mkdtempSync(path.join(os.tmpdir(), "manualsamur-release-"));
  const input = path.join(temp, "completed.json");
  const output = path.join(temp, "out.json");
  const handoff = path.join(temp, "handoff.json");
  const currentSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const current = completeEvidence();
  current.provenance.commitSha = currentSha;
  current.provenance.nodeVersion = process.version;
  current.provenance.expoVersion = "57.0.20";
  writeFileSync(input, JSON.stringify(current));
  const env = { ...process.env };
  delete env.GITHUB_SHA;
  delete env.GITHUB_REF;
  delete env.GITHUB_RUN_ID;
  const script = path.join(root, "apps/mobile/scripts/collect-release-evidence.ts");
  const fresh = spawnSync(process.execPath, ["--experimental-strip-types", script, "--strict", `--input=${input}`, `--output=${output}`, `--handoff-output=${handoff}`], { cwd: root, env, encoding: "utf8" });
  // Complete evidence and fresh provenance are no longer enough on their own:
  // `--strict` also gates on the four App Store legal fields, which are still
  // `PENDING_SETTINGS_LEGAL_METADATA` placeholders. Until a human fills them in,
  // strict mode is *meant* to block — this asserts that gate, and the two lines
  // below still prove the provenance half of the check works.
  assert.equal(fresh.status, 1, fresh.stdout + fresh.stderr);
  assert.match(fresh.stdout, /Falta la URL de la política de privacidad/);
  assert.equal(JSON.parse(readFileSync(handoff, "utf8")).status, "blocked");
  const nonStrict = spawnSync(process.execPath, ["--experimental-strip-types", script, `--input=${input}`, `--output=${output}`, `--handoff-output=${handoff}`], { cwd: root, env, encoding: "utf8" });
  assert.equal(nonStrict.status, 0, nonStrict.stdout + nonStrict.stderr);
  const completedHandoff = JSON.parse(readFileSync(handoff, "utf8"));
  assert.equal(completedHandoff.status, "ready-for-human-upload");
  assert.equal(completedHandoff.productionDecision.submission, "required");
  assert.equal(completedHandoff.humanReview.status, "complete");
  const stale = { ...current, provenance: { ...current.provenance, commitSha: "fedcba9876543210fedcba9876543210fedcba98" } };
  writeFileSync(input, JSON.stringify(stale));
  const rejected = spawnSync(process.execPath, ["--experimental-strip-types", script, "--strict", `--input=${input}`, `--output=${output}`, `--handoff-output=${handoff}`], { cwd: root, env, encoding: "utf8" });
  assert.equal(rejected.status, 1, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout, /otro commit/);
  assert.equal(JSON.parse(readFileSync(handoff, "utf8")).status, "blocked");
});
