const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");
const xcode = require("xcode");
const pbxFile = require("xcode/lib/pbxFile");
const { copyResolvableAttachments } = require("./attachment-bundle");

// Mirrors the recursive-search pattern used by the other plugins in this directory
// (with-ios-scene-lifecycle.js, with-ios-launch-screen.js).
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

/**
 * Bundles the 310 resolvable attachments into the iOS app as two Xcode "folder
 * references" (blue folders) named `docs` and `images`, added to the main target's
 * Copy Bundle Resources build phase. A folder reference — unlike a regular group —
 * is copied into the built app verbatim, preserving its internal subdirectory
 * structure, so it lands at `<app bundle>/docs/...` and `<app bundle>/images/...`,
 * matching `Bundle.main.bundlePath` (expo-file-system's `Paths.bundle`) plus the
 * manifest's `localPath` with its leading slash stripped.
 *
 * The staging copy lives under the generated (gitignored) `ios/` directory and is
 * rebuilt on every prebuild; nothing here is committed.
 */
function withIOSAttachmentAssets(config) {
  return withDangerousMod(config, ["ios", async (modConfig) => {
    const projectRoot = modConfig.modRequest.platformProjectRoot;
    const mobileAppRoot = modConfig.modRequest.projectRoot;

    const stagingRoot = path.join(projectRoot, "BundledAttachments");
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    const { copied, total } = copyResolvableAttachments(mobileAppRoot, stagingRoot);
    console.log(`[with-ios-attachment-assets] copied ${copied}/${total} bundled attachment files into ${stagingRoot}`);

    const projectPath = findFile(projectRoot, "project.pbxproj");
    if (!projectPath) throw new Error("with-ios-attachment-assets could not find project.pbxproj");
    const project = xcode.project(projectPath);
    project.parseSync();
    const target = project.getFirstTarget().uuid;
    // `addResourceFile`'s default placement calls `pbxGroupByName('Resources').path`,
    // which throws on RN/Expo-generated projects that have no group literally named
    // "Resources" (the same limitation with-ios-launch-screen.js works around for
    // `removeResourceFile`). Build the file reference / build-file / build-phase
    // entries directly instead, and attach the group to the project's main group so
    // Xcode has somewhere valid to show it.
    const mainGroupKey = project.getFirstProject().firstProject.mainGroup;

    for (const folderName of ["docs", "images"]) {
      const folderPath = path.join(stagingRoot, folderName);
      if (!fs.existsSync(folderPath)) continue;
      const relativeFolderPath = path.relative(projectRoot, folderPath);
      if (project.hasFile(relativeFolderPath)) continue;

      const file = new pbxFile(relativeFolderPath, { lastKnownFileType: "folder" });
      file.uuid = project.generateUuid();
      file.fileRef = project.generateUuid();
      file.target = target;

      project.addToPbxFileReferenceSection(file);
      project.addToPbxBuildFileSection(file);
      project.addToPbxResourcesBuildPhase(file);
      project.addToPbxGroup(file, mainGroupKey);
    }

    fs.writeFileSync(projectPath, project.writeSync());
    return modConfig;
  }]);
}

module.exports = withIOSAttachmentAssets;
