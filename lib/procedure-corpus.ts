import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export interface ProcedureCorpusRecord {
  filePath: string;
  relativePath: string;
  sectionDirectory: string;
  filenameStem: string;
  id: string;
  slug: string;
  section: string;
}

export interface ProcedureCorpusViolation {
  file: string;
  reason: string;
}

// Numeric IDs: "219", "412_01", "214a", "126a"
// DRP section uses a letter-prefixed scheme: "drp_01", "drp_02", "drp_03"
const PROCEDURE_ID_RE = /^(\d+([a-z]|_\d+)*|drp_\d+)$/;

export function walkProcedureFiles(proceduresDir: string): string[] {
  if (!fs.existsSync(proceduresDir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(proceduresDir, { withFileTypes: true })) {
    const entryPath = path.join(proceduresDir, entry.name);
    if (entry.isDirectory()) files.push(...walkProcedureFiles(entryPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(entryPath);
  }

  return files.sort();
}

export function readProcedureCorpus(proceduresDir: string): ProcedureCorpusRecord[] {
  return walkProcedureFiles(proceduresDir).map((filePath) => {
    const filenameStem = path.basename(filePath, ".md");
    const { data } = matter(fs.readFileSync(filePath, "utf8"));

    return {
      filePath,
      relativePath: path.relative(proceduresDir, filePath),
      sectionDirectory: path.basename(path.dirname(filePath)),
      filenameStem,
      id: String(data.id ?? ""),
      // This matches the runtime loader's fallback when legacy records omit slug.
      slug: String(data.slug ?? filenameStem),
      section: String(data.section ?? "General"),
    };
  });
}

function duplicateValues(records: ProcedureCorpusRecord[], value: (record: ProcedureCorpusRecord) => string) {
  const filesByValue = new Map<string, string[]>();
  for (const record of records) {
    const key = value(record);
    const files = filesByValue.get(key) ?? [];
    files.push(record.relativePath);
    filesByValue.set(key, files);
  }

  return new Map([...filesByValue].filter(([, files]) => files.length > 1));
}

export function findProcedureCorpusViolations(records: ProcedureCorpusRecord[]): ProcedureCorpusViolation[] {
  const violations: ProcedureCorpusViolation[] = [];
  const duplicateIds = duplicateValues(records, (record) => record.id);
  const duplicateSlugs = duplicateValues(records, (record) => record.slug);

  for (const record of records) {
    if (!PROCEDURE_ID_RE.test(record.id)) {
      violations.push({ file: record.relativePath, reason: `id "${record.id}" is not a valid numeric procedure ID` });
    }

    if (record.filenameStem !== record.id) {
      violations.push({
        file: record.relativePath,
        reason: `filename "${record.filenameStem}.md" does not match id "${record.id}"`,
      });
    }

    const idFiles = duplicateIds.get(record.id);
    if (idFiles) {
      violations.push({
        file: record.relativePath,
        reason: `procedure id "${record.id}" is duplicated in: ${idFiles.join(", ")}`,
      });
    }

    const slugFiles = duplicateSlugs.get(record.slug);
    if (slugFiles) {
      violations.push({
        file: record.relativePath,
        reason: `canonical slug "${record.slug}" is duplicated in: ${slugFiles.join(", ")}`,
      });
    }
  }

  return violations;
}
