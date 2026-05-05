#!/usr/bin/env node
/**
 * migrate-to-subfolders.ts — Move flat content/procedures/*.md files into
 * section-based subdirectories.
 *
 * Usage:
 *   node --experimental-strip-types scripts/migrate-to-subfolders.ts
 *   node --experimental-strip-types scripts/migrate-to-subfolders.ts --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCEDURES_DIR = path.join(__dirname, "../content/procedures");
const DRY_RUN = process.argv.includes("--dry-run");

function sectionToSubfolder(section: string): string {
  return section
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const entries = fs.readdirSync(PROCEDURES_DIR, { withFileTypes: true });
const mdFiles = entries
  .filter((e) => e.isFile() && e.name.endsWith(".md"))
  .map((e) => e.name);

if (mdFiles.length === 0) {
  console.log("No flat .md files found — already migrated or empty directory.");
  process.exit(0);
}

const bySub = new Map<string, string[]>();
let moved = 0;

for (const filename of mdFiles) {
  const filePath = path.join(PROCEDURES_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = matter(raw);
  const section = (typeof data.section === "string" ? data.section : "General") as string;
  const subfolder = sectionToSubfolder(section);
  const targetDir = path.join(PROCEDURES_DIR, subfolder);
  const targetPath = path.join(targetDir, filename);

  if (!bySub.has(subfolder)) bySub.set(subfolder, []);
  bySub.get(subfolder)!.push(filename);

  if (!DRY_RUN) {
    fs.mkdirSync(targetDir, { recursive: true });
    fs.renameSync(filePath, targetPath);

    const blocksPath = filePath.replace(/\.md$/, ".blocks.json");
    if (fs.existsSync(blocksPath)) {
      fs.renameSync(blocksPath, path.join(targetDir, filename.replace(/\.md$/, ".blocks.json")));
    }
  }
  moved++;
}

console.log(DRY_RUN ? "DRY RUN — no files moved\n" : "");
for (const [sub, files] of [...bySub.entries()].sort()) {
  console.log(`  ${sub}/  (${files.length})`);
  for (const f of files) console.log(`    ${f}`);
}
console.log(`\n${DRY_RUN ? "Would move" : "Moved"}: ${moved} files into ${bySub.size} subdirectories`);
