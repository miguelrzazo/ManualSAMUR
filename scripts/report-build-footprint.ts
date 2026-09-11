import fs from "node:fs";
import path from "node:path";

const outputRoot = path.join(process.cwd(), "out");
const warningBytes = 500 * 1024 * 1024;

function bytesIn(filePath: string): number {
  const stat = fs.statSync(filePath);
  if (stat.isFile()) return stat.size;
  return fs.readdirSync(filePath).reduce((total, entry) => total + bytesIn(path.join(filePath, entry)), 0);
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

if (!fs.existsSync(outputRoot)) {
  console.warn("[build-footprint] out/ no existe; no se puede medir la salida estática.");
  process.exit(0);
}

const entries = fs.readdirSync(outputRoot, { withFileTypes: true })
  .map((entry) => ({ name: entry.name, bytes: bytesIn(path.join(outputRoot, entry.name)) }))
  .sort((left, right) => right.bytes - left.bytes);
const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);

console.log(`[build-footprint] salida estática total: ${formatBytes(total)}`);
for (const entry of entries.slice(0, 8)) console.log(`[build-footprint] ${formatBytes(entry.bytes)}\t${entry.name}`);
if (total > warningBytes) {
  console.warn(`[build-footprint] Aviso no bloqueante: la salida supera ${formatBytes(warningBytes)}.`);
}
