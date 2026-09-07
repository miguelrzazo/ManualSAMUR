const { withAppBuildGradle } = require("expo/config-plugins");

/** Keep signing reproducible through Expo prebuild; private credentials stay outside Git. */
module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let source = mod.modResults.contents;
    if (source.includes("// SAMUR release signing")) return mod;
    source = `// SAMUR release signing\n` +
      `def samurKeyFile = System.getenv('SAMUR_RELEASE_STORE_FILE')\n` +
      `def samurStorePassword = System.getenv('SAMUR_RELEASE_STORE_PASSWORD')\n` +
      `def samurKeyAlias = System.getenv('SAMUR_RELEASE_KEY_ALIAS')\n` +
      `def samurKeyPassword = System.getenv('SAMUR_RELEASE_KEY_PASSWORD')\n` +
      `def samurSigningReady = [samurKeyFile, samurStorePassword, samurKeyAlias, samurKeyPassword].every { it != null && !it.trim().isEmpty() }\n` +
      `if (gradle.startParameter.taskNames.any { it.toLowerCase().contains('release') } && !samurSigningReady) throw new GradleException('Manual SAMUR release signing credentials are required; refusing an unsigned/debug-signed release.')\n\n` + source;
    source = source.replace("signingConfigs {", `signingConfigs {\n        if (samurSigningReady) {\n            release {\n                storeFile file(samurKeyFile)\n                storePassword samurStorePassword\n                keyAlias samurKeyAlias\n                keyPassword samurKeyPassword\n            }\n        }`);
    source = source.replace(/(release\s*\{\s*(?:\/\/[^\n]*\n\s*)*)signingConfig signingConfigs.debug/, "$1if (samurSigningReady) signingConfig signingConfigs.release");
    if (/release\s*\{[^}]*signingConfig signingConfigs.debug/.test(source)) throw new Error("Expo Android release template changed: cannot safely configure signing");
    mod.modResults.contents = source;
    return mod;
  });
};
