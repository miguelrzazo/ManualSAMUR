import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { parsePathologyCodes, parseRadioProcedure, reconcileCodeRecords, type ReferenceRecord } from "./reference-dataset-sync.ts";

export const CODE_SOURCE_FILES = ["121_codigos_USVA.pdf", "121_codigos_USVB.pdf", "121_codigos_psicologia.pdf"];
export const codeSourceHash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Preserve reviewed datasets while source bytes are unchanged; changed sources must fully validate. */
export function buildCodeDatasetCandidates(root: string, procedureContent: string, previousHashes: Record<string, string>) {
  const hashes: Record<string, string> = { procedure121: codeSourceHash(procedureContent.trim()) };
  const candidates = new Map<string, ReferenceRecord[]>();
  const read = (group: string): ReferenceRecord[] => JSON.parse(fs.readFileSync(path.join(root, `content/data/codigos-${group}.json`), "utf8"));
  const replace = (group: string, rows: ReferenceRecord[]) => candidates.set(group, reconcileCodeRecords(read(group), rows));
  for (const name of CODE_SOURCE_FILES) {
    const source = path.join(root, "public/docs/procedures/121", name);
    hashes[name] = codeSourceHash(fs.readFileSync(source));
    if (hashes[name] === previousHashes[name]) continue;
    const raw = execFileSync("pdftotext", ["-raw", source, "-"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
    const records = parsePathologyCodes(raw);
    if (name.includes("USVA")) {
      replace("sva", records.filter((row) => !row.code.startsWith("AS.")));
      replace("lima", records.filter((row) => row.code.startsWith("AS.")));
    } else if (name.includes("USVB")) {
      replace("svb", records.filter((row) => !row.code.startsWith("P.") && !row.code.startsWith("AS.")));
      replace("upsq", records.filter((row) => row.code.startsWith("P.")));
    } else replace("upsi", records);
  }
  if (hashes.procedure121 !== previousHashes.procedure121) {
    const radio = parseRadioProcedure(procedureContent);
    replace("pc", radio.claves);
    replace("indicativos", radio.indicativos);
    replace("incidente", radio.incidente);
  }
  return { hashes, candidates };
}
