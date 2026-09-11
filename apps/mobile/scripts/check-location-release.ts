import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { locationPolicyReady, locationPolicyStatus, type LocationSourcePolicy } from "../src/location-logic.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(appRoot, "location-source-policy.json"), "utf8")) as LocationSourcePolicy;
if (!locationPolicyReady(policy)) {
  console.error(`[mobile-locations] release bloqueada: política ${locationPolicyStatus(policy)}; falta aprobación y congelación del propietario de la fuente canónica, alcance hospitalario y frescura.`);
  process.exitCode = 1;
} else {
  console.log("[mobile-locations] política de ubicación aprobada y congelada");
}
