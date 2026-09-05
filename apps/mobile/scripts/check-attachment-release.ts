import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateAttachmentRelease, type AttachmentReleasePolicy } from "../src/attachment-logic.ts";
import { isValidManifestAttachment, type MobileAttachmentManifest } from "../src/data/schema.ts";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const policy = JSON.parse(fs.readFileSync(path.join(appRoot, "attachment-release-policy.json"), "utf8")) as AttachmentReleasePolicy;
const manifest = JSON.parse(fs.readFileSync(path.join(appRoot, "src/data/attachment-manifest.json"), "utf8")) as MobileAttachmentManifest;
const availability = Object.fromEntries(manifest.attachments.map((attachment) => {
  const localFile = path.join(appRoot, "..", "..", "public", attachment.localPath.slice(1));
  return [attachment.id, { bundled: fs.existsSync(localFile) && isValidManifestAttachment(attachment) }];
}));
const report = evaluateAttachmentRelease(manifest.attachments, policy, availability);
if (!report.ready) {
  console.error(`[mobile-attachments] release bloqueada: ${report.issues.map((issue) => issue.detail).join(" ")}`);
  process.exitCode = 1;
} else {
  console.log(`[mobile-attachments] release lista: ${report.essentialBytes} bytes esenciales, ${report.installedBytes} bytes instalados`);
}
