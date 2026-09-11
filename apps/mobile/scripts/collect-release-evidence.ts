import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { compareCurrentProvenance, createInternalTestHandoff, createReleaseEvidence, validateReleaseEvidence, type ReleaseEvidence, type ReleaseEvidenceProvenance } from "../src/release-evidence.ts";
import type { MobileSnapshot } from "../src/data/schema.ts";
import { PENDING_SETTINGS_LEGAL_METADATA, validateSettingsReleaseMetadata } from "../src/settings-legal.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(appRoot, "..", "..");

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function gitValue(...args: string[]): string {
  try { return execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8" }).trim(); } catch { return ""; }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const snapshot = readJson<MobileSnapshot>(path.join(appRoot, "src/data/snapshot.json"));
// Issue #62: the attachment allowlist/asset owner gate is resolved once the policy
// file itself records owner approval — evidence should reflect that rather than
// hardcode "pending" forever after the decision has actually been made.
const attachmentPolicy = readJson<{ approved?: boolean }>(path.join(appRoot, "attachment-release-policy.json"));
const ownerGateDefaults = { attachments: attachmentPolicy.approved ? ("approved" as const) : ("pending" as const) };
const mobilePackage = readJson<{ packages?: Record<string, { version?: string }>; dependencies?: { expo?: string } }>(path.join(appRoot, "package-lock.json"));
const expoVersion = String(mobilePackage.packages?.["node_modules/expo"]?.version ?? mobilePackage.dependencies?.expo ?? "unknown");
const commitSha = process.env.GITHUB_SHA || gitValue("rev-parse", "HEAD");
const generatedAt = process.env.MOBILE_EVIDENCE_TIMESTAMP || new Date().toISOString();
const buildId = process.env.MOBILE_BUILD_ID || process.env.GITHUB_RUN_ID || `local-${commitSha.slice(0, 12)}`;
const provenance: ReleaseEvidenceProvenance = {
  commitSha,
  ref: process.env.GITHUB_REF || gitValue("symbolic-ref", "--short", "HEAD") || "detached",
  buildId,
  workflowRunId: process.env.GITHUB_RUN_ID || null,
  nodeVersion: process.version,
  expoVersion,
  package: {
    schema: snapshot.schema,
    version: snapshot.version,
    generatedAt: snapshot.generatedAt,
    contentHash: snapshot.contentHash ?? snapshot.hash,
    packageHash: snapshot.packageHash ?? "",
  },
};

const evidenceOutput = path.resolve(repositoryRoot, argument("output") || process.env.MOBILE_EVIDENCE_OUTPUT || path.join("artifacts", "mobile-release-evidence.json"));
const handoffOutput = path.resolve(repositoryRoot, argument("handoff-output") || process.env.MOBILE_HANDOFF_OUTPUT || path.join(path.dirname(evidenceOutput), "mobile-internal-test-handoff.json"));
const inputPath = argument("input") || process.env.MOBILE_EVIDENCE_INPUT;
const evidence = inputPath
  ? readJson<ReleaseEvidence>(path.resolve(repositoryRoot, inputPath))
  : createReleaseEvidence(snapshot, provenance, generatedAt, ownerGateDefaults);
const evidenceFile = path.relative(repositoryRoot, evidenceOutput);
const strict = process.argv.includes("--strict");
const provenanceIssues = inputPath ? compareCurrentProvenance(evidence.provenance, provenance) : [];
const validation = validateReleaseEvidence(evidence, strict);
const settingsIssues = strict
  ? validateSettingsReleaseMetadata(PENDING_SETTINGS_LEGAL_METADATA).map((issue) => issue.message)
  : [];
const issues = [...validation.issues, ...provenanceIssues, ...settingsIssues];
const handoff = createInternalTestHandoff(evidence, evidenceFile);
if (strict && (provenanceIssues.length > 0 || settingsIssues.length > 0)) handoff.status = "blocked";
writeJson(evidenceOutput, evidence);
writeJson(handoffOutput, handoff);

console.log(`[mobile-release] evidence: ${evidenceFile}`);
console.log(`[mobile-release] handoff: ${path.relative(repositoryRoot, handoffOutput)}`);
console.log(`[mobile-release] status: ${validation.ready && provenanceIssues.length === 0 && settingsIssues.length === 0 ? "ready" : "blocked"}`);
if (issues.length > 0) {
  for (const issue of issues) console.log(`[mobile-release] pending: ${issue}`);
  if (strict) process.exitCode = 1;
}
