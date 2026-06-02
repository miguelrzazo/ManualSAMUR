import SwiftUI

@main
struct ManualSAMURApp: App {
    @State private var store = DataStore()
    @AppStorage("app.appearance") private var appearance = "auto"

    private var preferredColorScheme: ColorScheme? {
        switch appearance {
        case "light": return .light
        case "dark":  return .dark
        default:      return nil
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.load() }
                .preferredColorScheme(preferredColorScheme)
        }
    }
}
