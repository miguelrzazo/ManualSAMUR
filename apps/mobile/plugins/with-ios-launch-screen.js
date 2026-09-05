const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withInfoPlist } = require("expo/config-plugins");
const xcode = require("xcode");
const pbxFile = require("xcode/lib/pbxFile");

// Expo's default iOS launch screen is an Interface Builder storyboard, compiled at
// build time by `ibtool`. `ibtool` refuses to run unless the iOS Simulator/Platform
// runtime matching the project's base SDK is installed (error: "iOS <SDK version>
// Platform Not Installed"). CI and local images are frequently ahead of or behind the
// bundled Xcode SDK on which simulator runtimes are actually downloaded, which turns an
// unrelated storyboard compile step into a hard build failure.
//
// Apple's own Xcode 14+ project template solves this the same way we do here: skip
// Interface Builder entirely and declare the launch screen declaratively via the
// `UILaunchScreen` Info.plist key (supported since iOS 14). This needs no ibtool step,
// so it can never hit the platform-mismatch failure above.
const backgroundColorName = "SplashBackgroundColor";
const backgroundColorHex = "D92732"; // matches app.json's splash.backgroundColor

function hexToUnitComponent(hex) {
  return (parseInt(hex, 16) / 255).toFixed(3);
}

function colorSetContents() {
  const r = hexToUnitComponent(backgroundColorHex.slice(0, 2));
  const g = hexToUnitComponent(backgroundColorHex.slice(2, 4));
  const b = hexToUnitComponent(backgroundColorHex.slice(4, 6));
  return JSON.stringify(
    {
      colors: [
        {
          color: {
            "color-space": "srgb",
            components: { red: r, green: g, blue: b, alpha: "1.000" },
          },
          idiom: "universal",
        },
      ],
      info: { author: "expo", version: 1 },
    },
    null,
    2,
  );
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

function findDir(root, dirname) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "Pods" || entry.name === ".git" || entry.name === "build") continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory() && entry.name === dirname) return entryPath;
    if (entry.isDirectory()) {
      const match = findDir(entryPath, dirname);
      if (match) return match;
    }
  }
  return undefined;
}

function withIOSLaunchScreen(config) {
  config = withInfoPlist(config, (modConfig) => {
    const results = { ...modConfig.modResults };
    delete results.UILaunchStoryboardName;
    results.UILaunchScreen = { UIColorName: backgroundColorName };
    return { ...modConfig, modResults: results };
  });

  return withDangerousMod(config, ["ios", async (modConfig) => {
    const projectRoot = modConfig.modRequest.platformProjectRoot;

    const assetsDir = findDir(projectRoot, "Images.xcassets");
    if (assetsDir) {
      const colorSetDir = path.join(assetsDir, `${backgroundColorName}.colorset`);
      fs.mkdirSync(colorSetDir, { recursive: true });
      fs.writeFileSync(path.join(colorSetDir, "Contents.json"), colorSetContents());
    }

    const storyboardPath = findFile(projectRoot, "SplashScreen.storyboard");
    if (storyboardPath) {
      const projectPath = findFile(projectRoot, "project.pbxproj");
      if (!projectPath) throw new Error("with-ios-launch-screen could not find project.pbxproj");
      const project = xcode.project(projectPath);
      project.parseSync();
      const relativeStoryboardPath = path.relative(projectRoot, storyboardPath);
      if (project.hasFile(relativeStoryboardPath)) {
        // xcodeproj's `removeResourceFile` assumes a PBXGroup literally named
        // "Resources" exists, which RN/Expo-generated projects don't have — it
        // throws on `project.pbxGroupByName('Resources').path`. Do the same steps
        // by hand, skipping that lookup.
        const file = new pbxFile(relativeStoryboardPath);
        file.target = project.getFirstTarget().uuid;

        project.removeFromPbxFileReferenceSection(file); // sets file.fileRef/file.uuid
        project.removeFromPbxBuildFileSection(file);
        project.removeFromPbxResourcesBuildPhase(file);

        const groups = project.hash.project.objects.PBXGroup || {};
        for (const groupKey of Object.keys(groups)) {
          if (groupKey.endsWith("_comment")) continue;
          const group = groups[groupKey];
          if (group?.children?.some((child) => child.comment === "SplashScreen.storyboard")) {
            project.removeFromPbxGroup(file, groupKey);
            break;
          }
        }

        fs.writeFileSync(projectPath, project.writeSync());
      }
      fs.rmSync(storyboardPath, { force: true });
    }

    return modConfig;
  }]);
}

module.exports = withIOSLaunchScreen;
module.exports.backgroundColorName = backgroundColorName;
module.exports.backgroundColorHex = backgroundColorHex;
