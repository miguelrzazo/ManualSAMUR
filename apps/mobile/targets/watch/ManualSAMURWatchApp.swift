import SwiftUI

@main
struct ManualSAMURWatchApp: App {
    @State private var store: ContentStore
    private let receiver: PhoneContentReceiver

    init() {
        let store = ContentStore(source: CloudflareContentSource(origin: Self.contentOrigin))
        let receiver = PhoneContentReceiver(store: store)
        store.onRefreshFailed = { [weak receiver] in receiver?.requestContentFromPhone() }
        receiver.activate()
        _store = State(initialValue: store)
        self.receiver = receiver
    }

    /// Production origin. Debug builds accept `-ContentOrigin <url>` as a launch argument
    /// so offline behaviour can be exercised in the simulator (which shares the Mac's network).
    private static var contentOrigin: URL {
        #if DEBUG
        if let override = UserDefaults.standard.string(forKey: "ContentOrigin"), let url = URL(string: override) {
            return url
        }
        #endif
        return CloudflareContentSource.productionOrigin
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
        }
    }
}

struct RootView: View {
    @Environment(ContentStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @SceneStorage("selectedTab") private var selectedTab = Tab.codes

    enum Tab: String {
        case codes, drugs, status4
    }

    var body: some View {
        TabView(selection: $selectedTab) {
            CodesTab().tag(Tab.codes)
            DrugsTab().tag(Tab.drugs)
            Status4Tab().tag(Tab.status4)
        }
        .tabViewStyle(.verticalPage)
        .task { await store.refreshIfStale() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await store.refreshIfStale() }
            }
        }
    }
}
