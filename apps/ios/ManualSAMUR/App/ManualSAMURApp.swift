import SwiftUI

@main
struct ManualSAMURApp: App {
    @State private var store = DataStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .task { await store.load() }
        }
    }
}
