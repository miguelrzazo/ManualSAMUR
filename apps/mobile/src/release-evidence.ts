import type { MobileSnapshot } from "./data/schema.ts";

export const RELEASE_EVIDENCE_SCHEMA = "samur-manual.mobile-release-evidence" as const;
export const RELEASE_EVIDENCE_VERSION = 1 as const;
export const RELEASE_HANDOFF_SCHEMA = "samur-manual.mobile-internal-test-handoff" as const;
export const RELEASE_HANDOFF_VERSION = 1 as const;

export const RELEASE_GATE_IDS = [
  "performance",
  "memory",
  "battery",
  "binary-size",
  "installed-size",
  "offline",
  "recovery",
  "attachments",
  "accessibility",
  "map-fallback",
  "route-gates",
] as const;

export type ReleaseGateId = (typeof RELEASE_GATE_IDS)[number];
export type ReleaseGateStatus = "pending" | "pass" | "fail" | "not-applicable";

export interface ReleaseGateEvidence {
  id: ReleaseGateId;
  status: ReleaseGateStatus;
  referenceDevice: "ios" | "android" | "both" | null;
  measuredAt: string | null;
  measurements: Record<string, number | string | boolean>;
  artifact: string | null;
  notes: string;
}

export interface ReferenceDeviceEvidence {
  platform: "ios" | "android";
  approved: boolean;
  model: string | null;
  os: string | null;
  approvalReference: string | null;
  approvedBy: string | null;
}

export interface ReleaseEvidenceProvenance {
  commitSha: string;
  ref: string;
  buildId: string;
  workflowRunId: string | null;
  nodeVersion: string;
  expoVersion: string;
  package: {
    schema: string;
    version: number;
    generatedAt: string;
    contentHash: string;
    packageHash: string;
  };
}

export interface ReleaseEvidence {
  schema: typeof RELEASE_EVIDENCE_SCHEMA;
  version: typeof RELEASE_EVIDENCE_VERSION;
  generatedAt: string;
  status: "blocked" | "ready";
  provenance: ReleaseEvidenceProvenance;
  referenceDevices: {
    ios: ReferenceDeviceEvidence;
    android: ReferenceDeviceEvidence;
  };
  gates: Record<ReleaseGateId, ReleaseGateEvidence>;
  fieldValidation: {
    status: "pending" | "pass" | "fail";
    checklist: string;
    phiProhibited: true;
    completedBy: string | null;
    completedAt: string | null;
  };
  ownerGates: {
    attachments: "pending" | "approved";
    locations: "pending" | "approved";
    onlineMap: "pending" | "approved";
    accessibility: "pending" | "approved";
  };
  signing: {
    ios: "missing" | "provided";
    android: "missing" | "provided";
    iosArtifact: string | null;
    androidArtifact: string | null;
    owner: string | null;
  };
  humanDecision: "required" | "approved";
}

export interface InternalTestHandoff {
  schema: typeof RELEASE_HANDOFF_SCHEMA;
  version: typeof RELEASE_HANDOFF_VERSION;
  status: "blocked" | "ready-for-human-upload";
  generatedAt: string;
  provenance: ReleaseEvidenceProvenance;
  evidenceFile: string;
  easConfig: {
    path: string;
    developmentProfile: string;
    internalDistributionProfile: string;
    signingSource: "human-controlled";
  };
  candidates: {
    ios: { artifact: string | null; signed: boolean; owner: string | null; testFlightAppId: string | null };
    android: { artifact: string | null; signed: boolean; owner: string | null; packageName: string | null };
  };
  humanActions: string[];
  nonActions: string[];
}

export interface ReleaseEvidenceValidation {
  ready: boolean;
  issues: string[];
}

const SHA256 = /^[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;

export function emptyReleaseGates(): Record<ReleaseGateId, ReleaseGateEvidence> {
  return Object.fromEntries(RELEASE_GATE_IDS.map((id) => [id, {
    id,
    status: "pending" as const,
    referenceDevice: null,
    measuredAt: null,
    measurements: {},
    artifact: null,
    notes: "Falta una medición reproducible en el dispositivo de referencia aprobado.",
  }])) as Record<ReleaseGateId, ReleaseGateEvidence>;
}

function validIso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function validateProvenance(provenance: Partial<ReleaseEvidenceProvenance> | undefined, issues: string[]): void {
  if (!provenance || !SHA1.test(provenance.commitSha ?? "")) issues.push("Falta el commit SHA-1 de procedencia.");
  if (!provenance?.ref) issues.push("Falta la referencia Git de procedencia.");
  if (!provenance?.buildId) issues.push("Falta el identificador reproducible de build.");
  if (!provenance?.nodeVersion) issues.push("Falta la versión de Node.");
  if (!provenance?.expoVersion) issues.push("Falta la versión de Expo.");
  const pkg = provenance?.package;
  if (!pkg || !pkg.schema || !Number.isInteger(pkg.version) || !validIso(pkg.generatedAt) || !SHA256.test(pkg.contentHash ?? "") || !SHA256.test(pkg.packageHash ?? "")) {
    issues.push("La procedencia del paquete móvil no contiene schema, versión, fecha y hashes válidos.");
  }
}

function validateReferenceDevice(device: ReferenceDeviceEvidence | undefined, platform: "ios" | "android", issues: string[]): void {
  if (!device || device.platform !== platform) {
    issues.push(`Falta el bloque de dispositivo ${platform}.`);
    return;
  }
  if (device.approved && (!device.model || !device.os || !device.approvalReference || !device.approvedBy)) {
    issues.push(`El dispositivo ${platform} figura aprobado sin modelo, OS, referencia y propietario completos.`);
  }
  if (!device.approved) issues.push(`El dispositivo ${platform} aún no está aprobado por el propietario.`);
}

export function validateReleaseEvidence(evidence: Partial<ReleaseEvidence>, strict = false): ReleaseEvidenceValidation {
  const issues: string[] = [];
  if (evidence.schema !== RELEASE_EVIDENCE_SCHEMA || evidence.version !== RELEASE_EVIDENCE_VERSION) issues.push("Schema o versión de evidencia incompatibles.");
  if (!validIso(evidence.generatedAt)) issues.push("La fecha de evidencia no es ISO válida.");
  if (strict && evidence.status !== "ready") issues.push("La evidencia no está marcada como lista.");
  validateProvenance(evidence.provenance, issues);
  validateReferenceDevice(evidence.referenceDevices?.ios, "ios", issues);
  validateReferenceDevice(evidence.referenceDevices?.android, "android", issues);
  for (const id of RELEASE_GATE_IDS) {
    const gate = evidence.gates?.[id];
    if (!gate || gate.id !== id) {
      issues.push(`Falta la gate ${id}.`);
      continue;
    }
    if (!["pending", "pass", "fail", "not-applicable"].includes(gate.status)) issues.push(`La gate ${id} tiene un estado inválido.`);
    if (gate.status === "pass" && (!gate.referenceDevice || !validIso(gate.measuredAt) || !gate.artifact)) issues.push(`La gate ${id} está en pass sin dispositivo, fecha y artefacto de evidencia.`);
    if (gate.status === "not-applicable" && !gate.notes.trim()) issues.push(`La gate ${id} marcada no aplicable necesita una justificación.`);
  }
  if (evidence.fieldValidation?.phiProhibited !== true) issues.push("La validación de campo debe prohibir explícitamente PHI.");
  if (evidence.fieldValidation?.status !== "pass") issues.push("Falta completar la validación sintética de campo.");
  for (const key of ["attachments", "locations", "onlineMap", "accessibility"] as const) {
    if (evidence.ownerGates?.[key] !== "approved") issues.push(`Falta la aprobación del propietario para ${key}.`);
  }
  if (evidence.signing?.ios !== "provided" || evidence.signing?.android !== "provided" || !evidence.signing?.iosArtifact || !evidence.signing?.androidArtifact || !evidence.signing?.owner) issues.push("Faltan candidatos firmados, artefactos y propietario de signing.");
  if (evidence.humanDecision !== "approved") issues.push("La decisión final debe permanecer explícita y humana.");
  return { ready: issues.length === 0, issues: strict ? issues : issues.filter((issue) => !issue.startsWith("Falta la gate") && !issue.startsWith("Falta completar")) };
}

export function createReleaseEvidence(snapshot: MobileSnapshot, provenance: ReleaseEvidenceProvenance, generatedAt: string): ReleaseEvidence {
  return {
    schema: RELEASE_EVIDENCE_SCHEMA,
    version: RELEASE_EVIDENCE_VERSION,
    generatedAt,
    status: "blocked",
    provenance: {
      ...provenance,
      package: {
        schema: snapshot.schema,
        version: snapshot.version,
        generatedAt: snapshot.generatedAt,
        contentHash: snapshot.contentHash ?? snapshot.hash,
        packageHash: snapshot.packageHash ?? "",
      },
    },
    referenceDevices: {
      ios: { platform: "ios", approved: false, model: null, os: null, approvalReference: null, approvedBy: null },
      android: { platform: "android", approved: false, model: null, os: null, approvalReference: null, approvedBy: null },
    },
    gates: emptyReleaseGates(),
    fieldValidation: { status: "pending", checklist: "apps/mobile/release/field-validation-checklist.md", phiProhibited: true, completedBy: null, completedAt: null },
    ownerGates: { attachments: "pending", locations: "pending", onlineMap: "pending", accessibility: "pending" },
    signing: { ios: "missing", android: "missing", iosArtifact: null, androidArtifact: null, owner: null },
    humanDecision: "required",
  };
}

export function createInternalTestHandoff(evidence: ReleaseEvidence, evidenceFile: string): InternalTestHandoff {
  const ready = validateReleaseEvidence(evidence, true).ready;
  return {
    schema: RELEASE_HANDOFF_SCHEMA,
    version: RELEASE_HANDOFF_VERSION,
    status: ready ? "ready-for-human-upload" : "blocked",
    generatedAt: evidence.generatedAt,
    provenance: evidence.provenance,
    evidenceFile,
    easConfig: { path: "apps/mobile/eas.json", developmentProfile: "development", internalDistributionProfile: "preview", signingSource: "human-controlled" },
    candidates: {
      ios: { artifact: evidence.signing.iosArtifact, signed: evidence.signing.ios === "provided" && Boolean(evidence.signing.iosArtifact), owner: evidence.signing.owner, testFlightAppId: null },
      android: { artifact: evidence.signing.androidArtifact, signed: evidence.signing.android === "provided" && Boolean(evidence.signing.androidArtifact), owner: evidence.signing.owner, packageName: null },
    },
    humanActions: [
      "Aprobar dispositivos de referencia y completar todas las mediciones reproducibles.",
      "Completar la revisión legal, derechos, privacidad, URLs, metadatos españoles, capturas, instrucciones y notas de versión.",
      "Configurar signing y propietarios fuera del repositorio; generar candidatos firmados con el perfil EAS preview si procede.",
      "Revisar y cargar manualmente el candidato en TestFlight y Google Play internal testing.",
      "Decidir manualmente envío, rollout, pausa, halt, rollback y aprobación de producción.",
    ],
    nonActions: [
      "Este handoff no contiene secretos ni certificados.",
      "Este handoff no sube, publica, promociona, detiene ni revierte ninguna release.",
    ],
  };
}
