const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");
const { copyResolvableAttachments } = require("./attachment-bundle");

/**
 * Bundles the 310 resolvable attachments into `android/app/src/main/assets`,
 * preserving the manifest's `localPath` layout (leading slash stripped). Gradle
 * packages everything under `src/main/assets` into the APK/AAB assets folder as-is,
 * so `docs/...` and `images/...` land directly under the asset root — matching
 * expo-file-system's `Paths.bundle` (`asset://`) plus the stripped `localPath`.
 *
 * The staging copy lives under the generated (gitignored) `android/` directory and
 * is rebuilt on every prebuild; nothing here is committed.
 */
function withAndroidAttachmentAssets(config) {
  return withDangerousMod(config, ["android", async (modConfig) => {
    const androidRoot = modConfig.modRequest.platformProjectRoot;
    const mobileAppRoot = modConfig.modRequest.projectRoot;

    const assetsRoot = path.join(androidRoot, "app", "src", "main", "assets");
    const { copied, total } = copyResolvableAttachments(mobileAppRoot, assetsRoot);
    console.log(`[with-android-attachment-assets] copied ${copied}/${total} bundled attachment files into ${assetsRoot}`);

    return modConfig;
  }]);
}

module.exports = withAndroidAttachmentAssets;
