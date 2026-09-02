#!/usr/bin/env node
/**
 * Validates the whole procedure corpus: numeric IDs, matching filename stems,
 * globally unique IDs, and unique canonical slugs.
 *
 * A valid ID matches /^\d+([a-z]|_\d+)*$/ — e.g. "219", "412_01", "214a".
 * A valid file is named `{id}.md`.
 *
 * Also prints the next available sequential ID per section for reference.
 *
 * Exit code 1 when violations are found.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { findProcedureCorpusViolations, readProcedureCorpus } from "../lib/procedure-corpus.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCEDURES_DIR = path.join(__dirname, "..", "content", "procedures");

// Numeric IDs: "219", "412_01", "214a", "126a"
// DRP section uses a letter-prefixed scheme: "drp_01", "drp_02", "drp_03"
const NUMERIC_ID_RE = /^(\d+([a-z]|_\d+)*|drp_\d+)$/;

// Extract the leading numeric component of an ID for max-tracking purposes.
// "412_01" → 412, "214a" → 214, "219" → 219
function numericBase(id: string): number {
  const m = id.match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : -1;
}

function main() {
  const records = readProcedureCorpus(PROCEDURES_DIR);
  const violations = findProcedureCorpusViolations(records);
  // section dir → max numeric base seen
  const sectionMax = new Map<string, number>();

  for (const record of records) {
    if (!NUMERIC_ID_RE.test(record.id)) continue;

    const base = numericBase(record.id);
    if (base > (sectionMax.get(record.sectionDirectory) ?? -1)) {
      sectionMax.set(record.sectionDirectory, base);
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
