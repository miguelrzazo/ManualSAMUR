const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withInfoPlist } = require("expo/config-plugins");
const xcode = require("xcode");

const sceneManifest = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: "Default Configuration",
        UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
      },
    ],
  },
};

const sceneDelegate = `internal import Expo
import React

@objc(SceneDelegate)
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    // Under the scene lifecycle, a cold launch's opening URL (deep link, or the
    // Expo Dev Launcher's own "connect to this server" link) arrives via
    // connectionOptions.urlContexts instead of application(_:didFinishLaunchingWithOptions:).
    // Forward it through launchOptions so RN's Linking.getInitialURL() still sees it.
    var launchOptions: [UIApplication.LaunchOptionsKey: Any] = [:]
    if let url = connectionOptions.urlContexts.first?.url {
      launchOptions[.url] = url
    }

    let window = UIWindow(windowScene: windowScene)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions.isEmpty ? nil : launchOptions
    )
    self.window = window
    appDelegate.window = window
  }

  // Handles URLs opened while the scene is already running (deep links, and the
  // Expo Dev Launcher / expo-updates reconnect flow), which the scene lifecycle
  // delivers here instead of application(_:open:options:).
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let url = URLContexts.first?.url else { return }
    RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }
}
`;

function findFile(root, filename) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "Pods" || entry.name === ".git") continue;
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === filename) return entryPath;
    if (entry.isDirectory()) {
      const match = findFile(entryPath, filename);
      if (match) return match;
    }
  }
  return undefined;
}

function updateAppDelegate(source) {
  const start = source.indexOf("#if os(iOS) || os(tvOS)");
  const end = source.indexOf("#endif", start);
  if (start < 0 || end < 0 || !source.slice(start, end).includes("factory.startReactNative")) return source;
  return `${source.slice(0, start)}// React Native is started by SceneDelegate for the iOS scene lifecycle.\n${source.slice(end + "#endif".length)}`;
}

function withIOSSceneLifecycle(config) {
  config = withInfoPlist(config, (modConfig) => ({
    ...modConfig,
    modResults: {
      ...modConfig.modResults,
      UIApplicationSceneManifest: sceneManifest,
    },
  }));

  return withDangerousMod(config, ["ios", async (modConfig) => {
    const projectRoot = modConfig.modRequest.platformProjectRoot;
    const appDelegatePath = findFile(projectRoot, "AppDelegate.swift");
    if (!appDelegatePath) throw new Error("with-ios-scene-lifecycle could not find AppDelegate.swift");
    const appDirectory = path.dirname(appDelegatePath);
    fs.writeFileSync(appDelegatePath, updateAppDelegate(fs.readFileSync(appDelegatePath, "utf8")));
    fs.writeFileSync(path.join(appDirectory, "SceneDelegate.swift"), sceneDelegate);
    const projectPath = findFile(projectRoot, "project.pbxproj");
    if (!projectPath) throw new Error("with-ios-scene-lifecycle could not find project.pbxproj");
    const project = xcode.project(projectPath);
    project.parseSync();
    const relativeScenePath = path.relative(projectRoot, path.join(appDirectory, "SceneDelegate.swift"));
    if (!project.hasFile(relativeScenePath)) {
      const mainGroup = project.getPBXGroupByKey(project.getFirstProject().firstProject.mainGroup);
      const appGroup = mainGroup?.children.find((child) => child.comment === path.basename(appDirectory));
      if (!appGroup) throw new Error("with-ios-scene-lifecycle could not find the iOS app source group");
      project.addSourceFile(relativeScenePath, { target: project.getFirstTarget().uuid }, appGroup.value);
      fs.writeFileSync(projectPath, project.writeSync());
    }
    return modConfig;
  }]);
}

module.exports = withIOSSceneLifecycle;
module.exports.sceneManifest = sceneManifest;
module.exports.sceneDelegate = sceneDelegate;
module.exports.updateAppDelegate = updateAppDelegate;
