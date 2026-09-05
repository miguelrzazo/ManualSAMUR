const fs = require("node:fs");
const path = require("node:path");

/**
 * Shared by the iOS and Android attachment-bundling config plugins (T2, issue #62).
 *
 * The owner decided every attachment in the manifest is "essential" — bundled offline
 * with the app rather than downloaded on demand. Only the 310 attachments that resolved
 * during content sync (have both byteLength and sha256) can actually be bundled; 8 are
 * permanently gone upstream (404) and are never copied here. attachment-runtime.ts already
 * refuses to mark an attachment "available" without matching bytes+hash, so leaving those
 * 8 out of the bundle is safe by construction — they simply stay unresolvable.
 */

function repositoryRootFrom(mobileAppRoot) {
  return path.resolve(mobileAppRoot, "..", "..");
}

function isResolvedAttachment(attachment) {
  return (
    Number.isSafeInteger(attachment.byteLength)
    && attachment.byteLength >= 0
    && typeof attachment.sha256 === "string"
    && /^[a-f0-9]{64}$/.test(attachment.sha256)
  );
}

function loadResolvableAttachments(mobileAppRoot) {
  const manifestPath = path.join(mobileAppRoot, "src/data/attachment-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return manifest.attachments.filter(isResolvedAttachment);
}

/**
 * Copies every resolvable attachment from `public/docs` / `public/images` at the
 * repository root into `destRoot`, preserving the manifest's `localPath` layout
 * (leading slash stripped) so a runtime lookup of `Paths.bundle + localPath.slice(1)`
 * resolves regardless of platform.
 */
function copyResolvableAttachments(mobileAppRoot, destRoot) {
  const repoRoot = repositoryRootFrom(mobileAppRoot);
  const attachments = loadResolvableAttachments(mobileAppRoot);
  let copied = 0;
  for (const attachment of attachments) {
    const relative = attachment.localPath.replace(/^\//, "");
    const source = path.join(repoRoot, "public", relative);
    if (!fs.existsSync(source)) {
      throw new Error(`attachment-bundle: source file missing for resolved attachment ${attachment.id}: ${source}`);
    }
    const destination = path.join(destRoot, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    copied += 1;
  }
  return { copied, total: attachments.length };
}

module.exports = {
  repositoryRootFrom,
  isResolvedAttachment,
  loadResolvableAttachments,
  copyResolvableAttachments,
};
