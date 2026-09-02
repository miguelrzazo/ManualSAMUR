import fs from "node:fs";
import path from "node:path";
import { buildMobileContentSnapshot } from "../../../lib/mobile-snapshot.ts";

const target = path.join(process.cwd(), "apps/mobile/src/data");
const snapshot = buildMobileContentSnapshot(process.cwd());
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, "snapshot.json"), `${JSON.stringify(snapshot)}\n`, "utf8");

const attachments = snapshot.content.procedures.flatMap((procedure) => procedure.attachments.map((attachment) => ({
  ...attachment,
  procedureId: procedure.id,
})));
const missingLocalPaths = attachments.filter((attachment) => !fs.existsSync(path.join(process.cwd(), "public", attachment.localPath.replace(/^\//, ""))));
if (missingLocalPaths.length > 0) {
  console.warn(`[mobile-content] Aviso: ${missingLocalPaths.length} anexos oficiales no están disponibles localmente; permanecen en el manifiesto para resolverlos en la fase de empaquetado/actualización.`);
}
fs.writeFileSync(path.join(target, "attachment-manifest.json"), `${JSON.stringify({ generatedAt: snapshot.generatedAt, attachments })}\n`, "utf8");
console.log(`[mobile-content] ${snapshot.content.procedures.length} procedimientos, ${attachments.length} anexos → apps/mobile/src/data`);
