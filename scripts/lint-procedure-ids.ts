#!/usr/bin/env node
/**
 * Validates the whole procedure corpus: numeric IDs, matching filename stems,
 * globally unique IDs, unique canonical slugs, and that every ficha and every
 * image comes from the official wiki (servpub.madrid.es) and nowhere else.
 *
 * A valid ID matches /^\d{3}(_\d{2})?$/ — e.g. "219", "412_01", "700_03".
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

// Tres dígitos de sección y, opcionalmente, un ordinal de dos dígitos.
const NUMERIC_ID_RE = /^\d{3}(_\d{2})?$/;

// Extract the leading numeric component of an ID for max-tracking purposes.
// "412_01" → 412, "219" → 219
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
