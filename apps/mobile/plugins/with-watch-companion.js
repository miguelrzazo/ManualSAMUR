const fs = require("node:fs");
const path = require("node:path");
const { withFinalizedMod } = require("expo/config-plugins");
const xcode = require("xcode");

/**
 * Companion to `@bacons/apple-targets` for the Apple Watch app in targets/watch.
 * apple-targets creates and embeds the watchOS target; this plugin, which runs after
 * every other mod (`withFinalizedMod`), adds what it does not:
 *
 * 1. Bundled offline seed. Writes targets/watch/watch-seed.json (gitignored) from
 *    content/data, using the same dataset mapping as lib/mobile-snapshot.ts (note
 *    `claves` comes from codigos-pc.json). The Watch only uses it until it has a copy
 *    from the backend or the iPhone; content/data stays the single source.
 * 2. Version alignment. apple-targets hardcodes MARKETING_VERSION "1.0"; an embedded
 *    Watch app must carry the same CFBundleShortVersionString/CFBundleVersion as the
 *    iPhone app, so both are copied from the Expo config.
 */

const WATCH_DIR = "targets/watch";
const SEED_FILE = "watch-seed.json";

function readData(repoRoot, name) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, "content", "data", `${name}.json`), "utf8"));
}

function buildSeed(repoRoot) {
  const manual = readData(repoRoot, "manual-sync");
  const generatedAt = manual.lastApprovedAt || manual.lastSyncAt || "1970-01-01T00:00:00.000Z";
  const content = {
    codes: {
      incidente: readData(repoRoot, "codigos-incidente"),
      sva: readData(repoRoot, "codigos-sva"),
      svb: readData(repoRoot, "codigos-svb"),
      upsi: readData(repoRoot, "codigos-upsi"),
      upsq: readData(repoRoot, "codigos-upsq"),
      icao: readData(repoRoot, "codigos-icao"),
      indicativos: readData(repoRoot, "codigos-indicativos"),
      claves: readData(repoRoot, "codigos-pc"),
      lima: readData(repoRoot, "codigos-lima"),
      cheatsheet: readData(repoRoot, "codigos-cheatsheet"),
    },
    drugs: readData(repoRoot, "vademecum"),
    commercialNames: readData(repoRoot, "vademecum-comerciales"),
    status4: readData(repoRoot, "status4"),
  };
  const digest = require("node:crypto").createHash("sha256").update(JSON.stringify(content)).digest("hex");
  // A "seed-" hash never equals a published hash, so the first online check downloads.
  return { schema: "samur-manual.mobile-content", version: 3, generatedAt, hash: `seed-${digest}`, content };
}

function findFile(root, filename) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "Pods" || entry.name === ".git" || entry.name === "build") continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === filename) return entryPath;
    if (entry.isDirectory()) {
      const match = findFile(entryPath, filename);
      if (match) return match;
    }
  }
  return undefined;
}

function alignWatchVersions(projectPath, watchBundleId, marketingVersion, buildNumber) {
  const project = xcode.project(projectPath);
  project.parseSync();
  const configurations = project.pbxXCBuildConfigurationSection();
  let patched = 0;
  for (const [key, configuration] of Object.entries(configurations)) {
    if (key.endsWith("_comment") || !configuration.buildSettings) continue;
    const settings = configuration.buildSettings;
    const bundleId = String(settings.PRODUCT_BUNDLE_IDENTIFIER || "").replace(/"/g, "");
    if (bundleId !== watchBundleId) continue;
    settings.MARKETING_VERSION = marketingVersion;
    settings.CURRENT_PROJECT_VERSION = buildNumber;
    patched += 1;
  }
  if (patched === 0) throw new Error(`with-watch-companion: no build configuration for ${watchBundleId}`);
  fs.writeFileSync(projectPath, project.writeSync());
  return patched;
}

function withWatchCompanion(config) {
  return withFinalizedMod(config, ["ios", async (modConfig) => {
    const mobileRoot = modConfig.modRequest.projectRoot;
    const repoRoot = path.resolve(mobileRoot, "..", "..");

    const seedPath = path.join(mobileRoot, WATCH_DIR, SEED_FILE);
    const seed = buildSeed(repoRoot);
    fs.writeFileSync(seedPath, JSON.stringify(seed));
    console.log(`[with-watch-companion] wrote ${path.relative(mobileRoot, seedPath)} (${fs.statSync(seedPath).size} bytes, data ${seed.generatedAt})`);

    const projectPath = findFile(modConfig.modRequest.platformProjectRoot, "project.pbxproj");
    if (!projectPath) throw new Error("with-watch-companion could not find project.pbxproj");
    const watchBundleId = `${modConfig.ios.bundleIdentifier}.watchkitapp`;
    const patched = alignWatchVersions(projectPath, watchBundleId, modConfig.version, String(modConfig.ios.buildNumber || "1"));
    console.log(`[with-watch-companion] aligned ${patched} watch build configurations to ${modConfig.version} (${modConfig.ios.buildNumber})`);
    return modConfig;
  }]);
}

module.exports = withWatchCompanion;
