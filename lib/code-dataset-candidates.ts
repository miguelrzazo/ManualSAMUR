import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parsePathologyCodes, parseRadioProcedure, reconcileCodeRecords, type ReferenceRecord } from "./reference-dataset-sync.ts";
import { CodeDatasetImplausibleError } from "./codigos-sync-logic.ts";

export interface SkippedCodeDataset { group: string; source: string; reason: string }

export const CODE_SOURCE_FILES = ["121_codigos_USVA.pdf", "121_codigos_USVB.pdf", "121_codigos_psicologia.pdf"];
export const codeSourceHash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Preserve reviewed datasets while source bytes are unchanged; changed sources must fully validate. */
export function buildCodeDatasetCandidates(root: string, procedureContent: string, previousHashes: Record<string, string>) {
  const hashes: Record<string, string> = { procedure121: codeSourceHash(procedureContent.trim()) };
  const candidates = new Map<string, ReferenceRecord[]>();
  const read = (group: string): ReferenceRecord[] => JSON.parse(fs.readFileSync(path.join(root, `content/data/codigos-${group}.json`), "utf8"));
  const skipped: SkippedCodeDataset[] = [];
  /**
   * An implausible candidate (mass loss of codes) keeps the reviewed dataset and
   * leaves its source hash unrecorded so the next run retries it. It no longer
   * aborts the whole monthly sync (#112): procedures and other datasets still
   * reach editorial review, and the skip is reported for a human to reconcile.
   */
  const replace = (group: string, rows: ReferenceRecord[], source: string) => {
    try { candidates.set(group, reconcileCodeRecords(read(group), rows)); }
    catch (error) {
      if (!(error instanceof CodeDatasetImplausibleError)) throw error;
      skipped.push({ group, source, reason: error.message });
    }
  };
  for (const name of CODE_SOURCE_FILES) {
    const source = path.join(root, "public/docs/procedures/121", name);
    hashes[name] = codeSourceHash(fs.readFileSync(source));
    if (hashes[name] === previousHashes[name]) continue;
    const raw = execFileSync("pdftotext", ["-raw", source, "-"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const records = parsePathologyCodes(raw);
    if (name.includes("USVA")) {
      replace("sva", records.filter((row) => !row.code.startsWith("AS.")), name);
      replace("lima", records.filter((row) => row.code.startsWith("AS.")), name);
    } else if (name.includes("USVB")) {
      replace("svb", records.filter((row) => !row.code.startsWith("P.") && !row.code.startsWith("AS.")), name);
      replace("upsq", records.filter((row) => row.code.startsWith("P.")), name);
    } else replace("upsi", records, name);
  }
  if (hashes.procedure121 !== previousHashes.procedure121) {
    const radio = parseRadioProcedure(procedureContent);
    replace("pc", radio.claves, "procedure121");
    replace("indicativos", radio.indicativos, "procedure121");
    replace("incidente", radio.incidente, "procedure121");
  }
  for (const source of new Set(skipped.map((item) => item.source))) {
    if (previousHashes[source] === undefined) delete hashes[source];
    else hashes[source] = previousHashes[source];
  }
  return { hashes, candidates, skipped };
}
