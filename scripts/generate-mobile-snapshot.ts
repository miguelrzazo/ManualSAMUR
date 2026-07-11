import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildMobileContentSnapshot } from "../lib/mobile-snapshot.ts";

const outputPath = path.join(process.cwd(), "apps/mobile/assets/data/content-snapshot.json");
mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(buildMobileContentSnapshot(), null, 2)}\n`);
console.log(`Generated ${outputPath}`);
