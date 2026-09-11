import fs from "node:fs";
import path from "node:path";

const filePath = path.join(process.cwd(), "content/data/vademecum.json");
const textFields = [
  "name",
  "presentation",
  "funcion",
  "indication",
  "dose",
  "contraindications",
  "efectos_secundarios",
  "precauciones",
  "interacciones",
  "incompatibilidades",
  "notes",
] as const;

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\u202f]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").replace(/[ \t]+([,.;:!?])/g, "$1").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const drugs = JSON.parse(fs.readFileSync(filePath, "utf8")) as Array<Record<string, unknown>>;
let changedValues = 0;
let changedDrugs = 0;

for (const drug of drugs) {
  let changed = false;
  for (const field of textFields) {
    if (typeof drug[field] !== "string") continue;
    const normalized = normalizeText(drug[field]);
    if (normalized === drug[field]) continue;
    drug[field] = normalized;
    changedValues += 1;
    changed = true;
  }
  if (changed) changedDrugs += 1;
}

if (process.argv.includes("--write")) {
  fs.writeFileSync(filePath, `${JSON.stringify(drugs, null, 2)}\n`);
}

console.log(`[normalize-vademecum-editorial] ${changedValues} valores en ${changedDrugs} fichas${process.argv.includes("--write") ? " actualizados" : " detectados"}.`);
