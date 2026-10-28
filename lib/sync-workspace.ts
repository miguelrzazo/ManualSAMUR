import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

const MUTABLE_PATHS = ["content", "docs", "public/docs", "public/images"];

function files(root: string): Map<string, string> {
  const result = new Map<string, string>();
  function visit(relative: string) {
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Sync refuses symbolic link: ${relative}`);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute)) visit(path.join(relative, entry));
    } else if (stat.isFile()) {
      result.set(relative, createHash("sha256").update(fs.readFileSync(absolute)).digest("hex"));
    }
  }
  for (const relative of MUTABLE_PATHS) visit(relative);
  return result;
}

/** Stage every domain and asset before touching the checkout; roll back failed commits. */
export async function withSyncWorkspace<T>(root: string, work: (candidate: string) => Promise<T>): Promise<T> {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "manualsamur-sync-"));
  const baseline = path.join(temp, "baseline");
  const candidate = path.join(temp, "candidate");
  fs.mkdirSync(candidate, { recursive: true });
  try {
    const before = files(root);
    for (const relative of MUTABLE_PATHS) {
      const source = path.join(root, relative);
      if (!fs.existsSync(source)) continue;
      fs.cpSync(source, path.join(baseline, relative), { recursive: true });
      fs.cpSync(source, path.join(candidate, relative), { recursive: true });
    }
    const result = await work(candidate);
    const after = files(candidate);
    const changed = [...new Set([...before.keys(), ...after.keys()])]
      .filter((relative) => before.get(relative) !== after.get(relative));
    const current = files(root);
    for (const relative of changed) {
      if (current.get(relative) !== before.get(relative)) throw new Error(`File changed during sync: ${relative}`);
    }
    const applied: string[] = [];
    try {
      for (const relative of changed) {
        applied.push(relative);
        const target = path.join(root, relative);
        if (after.has(relative)) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.copyFileSync(path.join(candidate, relative), target);
        } else fs.rmSync(target);
      }
    } catch (error) {
      for (const relative of applied.reverse()) {
        const target = path.join(root, relative);
        if (before.has(relative)) fs.copyFileSync(path.join(baseline, relative), target);
        else fs.rmSync(target, { force: true });
      }
      throw error;
    }
    return result;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

/** Stable local classification and all editorial fields survive upstream refreshes. */
export function mergeProcedureSourceFields(
  source: Record<string, unknown>, existing?: Record<string, unknown>,
): Record<string, unknown> {
  if (!existing) return source;
  const result = { ...existing, ...source };
  for (const key of ["id", "title", "section", "slug", "tags", "synonyms", "related", "editorialStatus", "editorialLockedAt", "lastApprovedOfficialUpdateAt"]) {
    if (Object.hasOwn(existing, key)) result[key] = existing[key];
  }
  return result;
}
