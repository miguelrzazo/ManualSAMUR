import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMobileContentPackage, isMobileContentPackage } from "../../../lib/mobile-snapshot.ts";
import { buildSeedSnapshot } from "../src/content-seed.ts";

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

// The app bundles only `seed.json`. It exists for the very first launch with
// no network; the first successful sync replaces it with a verified release
// from the Cloudflare API. Fields the app can live without on that first
// launch are dropped: `searchText` duplicates `content` (search falls back to
// it) and `updates` is the recent-changes feed, which only means something
// relative to a live release. The seed keeps the source hashes for identity,
// but is never cryptographically validated nor treated as a release.
const seed = buildSeedSnapshot(snapshot);
fs.writeFileSync(path.join(target, "seed.json"), `${JSON.stringify(seed)}\n`, "utf8");
const full = Buffer.byteLength(JSON.stringify(snapshot));
const reduced = Buffer.byteLength(JSON.stringify(seed));
console.log(`[mobile-content] semilla ${(reduced / 1024 / 1024).toFixed(2)} MB (paquete completo ${(full / 1024 / 1024).toFixed(2)} MB)`);
console.log(`[mobile-content] ${snapshot.content.procedures.length} procedimientos, ${attachments.length} anexos, paquete ${snapshot.packageHash} → apps/mobile/src/data`);
