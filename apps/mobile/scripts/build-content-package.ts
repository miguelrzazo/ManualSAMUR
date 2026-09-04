import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMobileContentPackage, isMobileContentPackage } from "../../../lib/mobile-snapshot.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const target = path.join(repositoryRoot, "apps/mobile/src/data");
const { snapshot, manifest } = buildMobileContentPackage(repositoryRoot);
if (!isMobileContentPackage(snapshot, manifest)) {
  throw new Error("[mobile-content] El paquete generado no supera la validación de integridad");
}
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, "snapshot.json"), `${JSON.stringify(snapshot)}\n`, "utf8");

const attachments = manifest.attachments;
const missingLocalPaths = attachments.filter((attachment) => !fs.existsSync(path.join(repositoryRoot, "public", attachment.localPath.replace(/^\//, ""))));
if (missingLocalPaths.length > 0) {
  console.warn(`[mobile-content] Aviso: ${missingLocalPaths.length} anexos oficiales no están disponibles localmente; permanecen en el manifiesto para resolverlos en la fase de empaquetado/actualización.`);
}
fs.writeFileSync(path.join(target, "attachment-manifest.json"), `${JSON.stringify(manifest)}\n`, "utf8");
console.log(`[mobile-content] ${snapshot.content.procedures.length} procedimientos, ${attachments.length} anexos, paquete ${snapshot.packageHash} → apps/mobile/src/data`);
