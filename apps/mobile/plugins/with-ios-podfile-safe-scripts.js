const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

// This plugin works around a family of CocoaPods/React Native build-phase scripts that
// break whenever the workspace path contains a space — which this repo's path
// ("Manual SAMUR/...") always does. Two independent instances of the same bug class:
//
// 1) expo-constants' EXConstants.podspec adds a CocoaPods script phase shaped exactly like:
//   bash -l -c "$PODS_TARGET_SRCROOT/../scripts/get-app-config-ios.sh"
// `bash -c` treats its argument as a full shell command line to parse, not a literal
// path to execute. When the resolved path contains a space (this repo lives under
// "Manual SAMUR/...", so it always does), the inner bash word-splits it and tries to
// run the text before the first space ("/Users/.../active/Manual") as a command,
// failing with "No such file or directory". This has nothing to do with the SDK/
// simulator-runtime issues the scene-lifecycle and launch-screen plugins work around —
// it is a plain CocoaPods quoting bug that only bites monorepos with spaces in their path.
//
// The fix lives in the generated Podfile's `post_install` hook: at that point CocoaPods
// has the in-memory Xcodeproj::Project for Pods.xcodeproj (not yet written to disk), so
// we can rewrite any matching script phase to wrap its path in single quotes. Outer /bin/sh
// (which runs the phase) expands `$PODS_TARGET_SRCROOT` inside the double quotes as before,
// but now hands the inner `bash -c` a string whose path is genuinely single-quoted, so the
// space no longer splits it into two words.
const postInstallPatch = `
    # Guard against space-breaking \`bash -l -c "$VAR/path.sh"\` CocoaPods script phases
    # (see apps/mobile/plugins/with-ios-podfile-safe-scripts.js).
    installer.pods_project.targets.each do |target|
      target.build_phases.each do |phase|
        next unless phase.respond_to?(:shell_script)
        script = phase.shell_script
        next if script.nil?
        if script =~ /\\Abash\\s+-l\\s+-c\\s+"([^"]+)"\\z/
          phase.shell_script = %(bash -l -c "'#{$1}'")
        end
      end
    end
`;

// 2) React Native's own `react-native-xcode.sh` bundling wrapper (written into the app
// target's "Bundle React Native code and images" build phase by Expo's prebuild) ends with:
//   `"$NODE_BINARY" --print "require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'"`
// A bare backtick expression as a statement runs its captured stdout (the resolved
// react-native-xcode.sh path) as a new command line. Same failure mode: a space in the
// path splits it into "command" + "argument". The fix: capture the path into a variable
// and invoke it as one quoted argument instead of letting the shell re-split it.
const oldRnXcodeInvocation = `\`\\"$NODE_BINARY\\" --print \\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\"\``;
const newRnXcodeInvocation = `RN_XCODE_SH=\\"$(\\"$NODE_BINARY\\" --print \\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\")\\"\\n\\"$RN_XCODE_SH\\"`;

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

function withIOSPodfileSafeScripts(config) {
  return withDangerousMod(config, ["ios", async (modConfig) => {
    const projectRoot = modConfig.modRequest.platformProjectRoot;

    const podfilePath = path.join(projectRoot, "Podfile");
    if (fs.existsSync(podfilePath)) {
      const contents = fs.readFileSync(podfilePath, "utf8");
      if (!contents.includes("with-ios-podfile-safe-scripts")) {
        const marker = "post_install do |installer|";
        const index = contents.indexOf(marker);
        if (index === -1) {
          throw new Error("with-ios-podfile-safe-scripts could not find the post_install hook in the generated Podfile");
        }
        const insertAt = index + marker.length;
        const patched = `${contents.slice(0, insertAt)}\n${postInstallPatch}${contents.slice(insertAt)}`;
        fs.writeFileSync(podfilePath, patched);
      }
    }

    const pbxprojPath = findFile(projectRoot, "project.pbxproj");
    if (pbxprojPath) {
      const contents = fs.readFileSync(pbxprojPath, "utf8");
      if (contents.includes(oldRnXcodeInvocation)) {
        fs.writeFileSync(pbxprojPath, contents.split(oldRnXcodeInvocation).join(newRnXcodeInvocation));
      }
    }

    return modConfig;
  }]);
}

module.exports = withIOSPodfileSafeScripts;
module.exports.postInstallPatch = postInstallPatch;
