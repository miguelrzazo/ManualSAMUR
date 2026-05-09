#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.join(__dirname, "..");

const LEGACY_DOCS_DIR = path.join(ROOT_DIR, "docs", "procedures");
const PUBLIC_DOCS_DIR = path.join(ROOT_DIR, "public", "docs", "procedures");

interface SyncStats {
  copied: number;
  skipped: number;
}

function shouldCopyFile(sourcePath: string, destinationPath: string) {
  if (!fs.existsSync(destinationPath)) return true;

  const sourceStat = fs.statSync(sourcePath);
  const destinationStat = fs.statSync(destinationPath);

  if (sourceStat.size !== destinationStat.size) return true;
  if (Math.floor(sourceStat.mtimeMs) !== Math.floor(destinationStat.mtimeMs)) return true;

  return false;
}

function syncDirectory(sourceDir: string, destinationDir: string, stats: SyncStats) {
  if (!fs.existsSync(sourceDir)) return;

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      fs.mkdirSync(destinationPath, { recursive: true });
      syncDirectory(sourcePath, destinationPath, stats);
      continue;
    }

    if (!entry.isFile()) continue;
    if (entry.name.toLowerCase().endsWith(".md")) continue;

    fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
    if (!shouldCopyFile(sourcePath, destinationPath)) {
      stats.skipped += 1;
      continue;
    }

    fs.copyFileSync(sourcePath, destinationPath);
    const sourceStat = fs.statSync(sourcePath);
    fs.utimesSync(destinationPath, sourceStat.atime, sourceStat.mtime);
    stats.copied += 1;
  }
}

function main() {
  if (!fs.existsSync(LEGACY_DOCS_DIR)) {
    console.log(`[sync-public-docs] No existe ${LEGACY_DOCS_DIR}, no hay nada que sincronizar.`);
    return;
  }

  fs.mkdirSync(PUBLIC_DOCS_DIR, { recursive: true });
  const stats: SyncStats = { copied: 0, skipped: 0 };
  syncDirectory(LEGACY_DOCS_DIR, PUBLIC_DOCS_DIR, stats);

  console.log(
    `[sync-public-docs] Sincronización completada. Copiados: ${stats.copied}, sin cambios: ${stats.skipped}.`,
  );
}

main();
