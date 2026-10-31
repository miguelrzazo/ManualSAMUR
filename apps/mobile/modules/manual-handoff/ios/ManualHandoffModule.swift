import ExpoModulesCore
import UIKit

/// Advertises the screen the user is reading as an `NSUserActivity` whose
/// `webpageURL` is the same page on the web. A Mac without the app opens that
/// URL in Safari from the Dock (Handoff); another device with the app receives
/// it through the scene delegate and routes it like a universal link.
public class ManualHandoffModule: Module {
  private var activity: NSUserActivity?

  public func definition() -> ModuleDefinition {
    Name("ManualHandoff")

    AsyncFunction("setCurrentActivity") { (activityType: String, url: String, title: String, eligibleForSearch: Bool) in
      guard let webpageURL = URL(string: url), webpageURL.scheme == "https" else {
        return
      }
      // Same page as before: keep the activity so Handoff does not flicker.
      if let current = self.activity, current.activityType == activityType, current.webpageURL == webpageURL {
        current.title = title
        current.becomeCurrent()
        return
      }
      self.activity?.invalidate()
      let next = NSUserActivity(activityType: activityType)
      next.webpageURL = webpageURL
      next.title = title
      next.isEligibleForHandoff = true
      next.isEligibleForSearch = eligibleForSearch
      next.isEligibleForPublicIndexing = false
      next.userInfo = ["url": url]
      next.requiredUserInfoKeys = ["url"]
      self.activity = next
      // Owning it from the root view controller lets UIKit make it current again
      // when the app returns to the foreground.
      Self.rootViewController()?.userActivity = next
      next.becomeCurrent()
      NSLog("[ManualHandoff] becomeCurrent type=%@ url=%@", activityType, url)
    }.runOnQueue(.main)

    AsyncFunction("clearCurrentActivity") {
      self.activity?.invalidate()
      self.activity = nil
      Self.rootViewController()?.userActivity = nil
    }.runOnQueue(.main)

    /// Debug readout: what the system currently holds, read back from native.
    AsyncFunction("getCurrentActivity") { () -> [String: Any]? in
      guard let activity = self.activity else { return nil }
      return [
        "activityType": activity.activityType,
        "webpageURL": activity.webpageURL?.absoluteString ?? "",
        "title": activity.title ?? "",
        "isEligibleForHandoff": activity.isEligibleForHandoff,
        "isEligibleForSearch": activity.isEligibleForSearch,
      ]
    }.runOnQueue(.main)
  }

  private static func rootViewController() -> UIViewController? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }?
      .rootViewController
  }
}
