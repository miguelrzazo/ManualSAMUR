/* eslint-disable @typescript-eslint/no-require-imports */
const { withPodfile } = require("expo/config-plugins");

const IOS_DEPLOYMENT_TARGET = "15.1";
const MARKER = "# ManualSAMUR: normalize pod deployment targets";

/**
 * AsyncStorage 2.x declares iOS 13.4 for its resource bundle. Newer Xcode
 * versions reject that target even when the aggregate app target is newer.
 * Keep this in the managed prebuild boundary so `expo prebuild` and CI produce
 * the same Podfile; never patch generated Pods by hand.
 */
module.exports = function withIosDeploymentTarget(config) {
  return withPodfile(config, (podfileConfig) => {
    const contents = podfileConfig.modResults.contents;
    if (contents.includes(MARKER)) return podfileConfig;

    const hook = "  post_install do |installer|\n";
    if (!contents.includes(hook)) {
      throw new Error("ManualSAMUR requires an Expo Podfile with a post_install hook");
    }

    const enforcement = `  ${MARKER}\n  installer.pods_project.targets.each do |target|\n    target.build_configurations.each do |build_config|\n      build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${IOS_DEPLOYMENT_TARGET}'\n    end\n  end\n\n`;
    podfileConfig.modResults.contents = contents.replace(hook, `${hook}${enforcement}`);
    return podfileConfig;
  });
};

module.exports.IOS_DEPLOYMENT_TARGET = IOS_DEPLOYMENT_TARGET;
