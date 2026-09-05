import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertOnlineMapReleaseReady, evaluateOnlineMapRelease, type OnlineMapReleasePolicy } from "../src/online-map-logic.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(appRoot, "online-map-provider-policy.json"), "utf8")) as OnlineMapReleasePolicy;
const report = evaluateOnlineMapRelease(policy);
if (!report.ready) {
  console.error(`[mobile-online-map] release bloqueada: ${report.issues.map((issue) => issue.detail).join(" ")}`);
  process.exitCode = 1;
} else {
  assertOnlineMapReleaseReady(report);
  console.log("[mobile-online-map] política aprobada; integración online habilitable");
}
