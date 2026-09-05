import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
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
  evidence.signing = { ios: "provided", android: "provided", iosArtifact: "artifacts/app.ipa", androidArtifact: "artifacts/app.aab", owner: "owner" };
  evidence.humanDecision = "approved";
  evidence.status = "ready";
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
  const matrix = JSON.parse(readFileSync(path.join(appRoot, "release/evidence-matrix.json"), "utf8")) as { requiredGates: Array<{ id: string }>; finalDecision: string };
  const schema = JSON.parse(readFileSync(path.join(appRoot, "release/evidence-schema.json"), "utf8")) as { properties: { gates: { required: string[] } } };
  const checklist = readFileSync(path.join(appRoot, "release/field-validation-checklist.md"), "utf8");
  assert.deepEqual(matrix.requiredGates.map((gate) => gate.id), [...RELEASE_GATE_IDS]);
  assert.deepEqual(schema.properties.gates.required, [...RELEASE_GATE_IDS]);
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
  assert.doesNotMatch(workflow, /(^|\n)\s*run:.*\b(?:eas\s+(?:submit|update|upload)|fastlane\s+(?:deliver|pilot)|gradle\s+publish|xcrun\s+altool)\b/i);
  assert.doesNotMatch(workflow, /uses:.*(?:apple-actions|google-github-actions).*store/i);
});

test("EAS config exposes only a human-controlled internal distribution profile", () => {
  const eas = JSON.parse(readFileSync(path.join(appRoot, "eas.json"), "utf8")) as { build: Record<string, { distribution?: string }> };
  assert.equal(eas.build.preview.distribution, "internal");
  assert.equal(eas.build.development.distribution, "internal");
  assert.equal(readFileSync(path.join(appRoot, "release/human-review-checklist.md"), "utf8").includes("human"), true);
});
