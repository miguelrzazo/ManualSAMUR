import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMobileContentPackage } from "../../../lib/mobile-snapshot.ts";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const dataDirectory = path.join(repositoryRoot, "apps/mobile/src/data");
const snapshot = JSON.parse(fs.readFileSync(path.join(dataDirectory, "snapshot.json"), "utf8")) as unknown;
const manifest = JSON.parse(fs.readFileSync(path.join(dataDirectory, "attachment-manifest.json"), "utf8")) as unknown;

if (!isMobileContentPackage(snapshot, manifest)) {
  throw new Error("[mobile-content] snapshot.json y attachment-manifest.json no forman un paquete válido");
}

console.log("[mobile-content] paquete válido: schema, rutas, bytes canónicos, hashes y anexos verificados");
