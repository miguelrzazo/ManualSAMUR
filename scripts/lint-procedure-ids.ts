#!/usr/bin/env node
/**
 * Validates that every procedure file uses a numeric ID and that the filename
 * stem matches the `id` frontmatter field.
 *
 * A valid ID matches /^\d+([a-z]|_\d+)*$/ — e.g. "219", "412_01", "214a".
 * A valid file is named `{id}.md`.
 *
 * Also prints the next available sequential ID per section for reference.
 *
 * Exit code 1 when violations are found.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCEDURES_DIR = path.join(__dirname, "..", "content", "procedures");

// Numeric IDs: "219", "412_01", "214a", "126a"
// DRP section uses a letter-prefixed scheme: "drp_01", "drp_02", "drp_03"
const NUMERIC_ID_RE = /^(\d+([a-z]|_\d+)*|drp_\d+)$/;

interface Violation {
  file: string;
  reason: string;
}

function walkMdFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...walkMdFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) results.push(full);
  }
  return results;
}

// Extract the leading numeric component of an ID for max-tracking purposes.
// "412_01" → 412, "214a" → 214, "219" → 219
function numericBase(id: string): number {
  const m = id.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

function main() {
  const violations: Violation[] = [];
  // section dir → max numeric base seen
  const sectionMax = new Map<string, number>();

  for (const filePath of walkMdFiles(PROCEDURES_DIR)) {
    const sectionDir = path.basename(path.dirname(filePath));
    const stem = path.basename(filePath, ".md");
    const raw = fs.readFileSync(filePath, "utf8");
    const { data } = matter(raw);
    const id = typeof data.id === "string" ? data.id : String(data.id ?? "");
    const rel = path.relative(PROCEDURES_DIR, filePath);

    if (!NUMERIC_ID_RE.test(id)) {
      violations.push({ file: rel, reason: `id "${id}" is not a valid numeric procedure ID` });
      continue;
    }

    if (stem !== id) {
      violations.push({ file: rel, reason: `filename "${stem}.md" does not match id "${id}"` });
    }

    const base = numericBase(id);
    if (base > (sectionMax.get(sectionDir) ?? -1)) {
      sectionMax.set(sectionDir, base);
    }
  }

  if (violations.length > 0) {
    console.error(`\n❌ ${violations.length} procedure ID violation(s):\n`);
    for (const v of violations) {
      console.error(`  ${v.file}\n    → ${v.reason}`);
    }
    console.error("");
  } else {
    console.log("✅ All procedure IDs are valid.");
  }

  console.log("Next available IDs per section:");
  for (const [section, max] of [...sectionMax.entries()].sort()) {
    console.log(`  ${section.padEnd(20)} current max=${max}  next=${max + 1}`);
  }

  if (violations.length > 0) process.exit(1);
}

main();
