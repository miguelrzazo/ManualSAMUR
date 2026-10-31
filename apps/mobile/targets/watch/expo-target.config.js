/**
 * Apple Watch companion app, generated into the iOS project by @bacons/apple-targets
 * on every `expo prebuild` and embedded in the iPhone app ("Embed Watch Content").
 * Version/build alignment and the bundled offline seed are handled by
 * ../../plugins/with-watch-companion.js.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: "watch",
  name: "ManualSAMURWatch",
  displayName: "SAMUR",
  bundleIdentifier: `${config.ios.bundleIdentifier}.watchkitapp`,
  deploymentTarget: "10.0",
  icon: "./watch-icon.png",
  frameworks: ["WatchConnectivity"],
  colors: {
    $accent: { color: "#5B8DEF", darkColor: "#5B8DEF" },
  },
});
