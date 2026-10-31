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
                // The UI is Spanish-only; keep dates and numbers Spanish on any device language.
                .environment(\.locale, Locale(identifier: "es_ES"))
        }
    }
}

enum AppRoute: Hashable {
    case about
}

struct RootView: View {
    @Environment(ContentStore.self) private var store
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab = Tab.codes
    @State private var path = NavigationPath()

    enum Tab: String {
        case codes, drugs, status4
    }

    /// Debug builds honour `-DebugRoute` so a screenshot can start on any page.
    private static var debugTab: Tab? {
        let route = DebugLaunch.string("DebugRoute")
        if route.hasPrefix("drug") { return .drugs }
        if route.hasPrefix("status4") { return .status4 }
        return nil
    }

    var body: some View {
        // One NavigationStack around the vertically paged TabView (the watchOS 10
        // pattern). Pages contribute title/toolbar; every destination lives here so it
        // is registered regardless of which page is visible.
        NavigationStack(path: $path) {
            TabView(selection: $selectedTab) {
                CodesTab().tag(Tab.codes)
                DrugsTab().tag(Tab.drugs)
                Status4Tab().tag(Tab.status4)
            }
            .tabViewStyle(.verticalPage)
            .navigationDestination(for: CodeRoute.self) { route in
                switch route {
                case .group(let key):
                    if let group = store.content?.codeGroups.first(where: { $0.key == key }) {
                        CodeGroupView(group: group)
                    }
                case .cheatsheet:
                    CheatsheetView(sections: store.content?.cheatsheet ?? [])
                case .code(let groupTitle, let entry):
                    CodeDetailView(groupTitle: groupTitle, entry: entry)
                }
            }
            .navigationDestination(for: Drug.self) { drug in
                DrugDetailView(drug: drug, commercial: store.content?.commercialNames.filter { $0.drugId == drug.id } ?? [])
            }
            .navigationDestination(for: Status4Entry.self) { entry in
                Status4DetailView(entry: entry)
            }
            .navigationDestination(for: AppRoute.self) { _ in
                AboutView()
            }
        }
        .task {
            #if DEBUG
            // A non-first page selected before the first layout pass is laid out with its
            // toolbar offset; switch once the paged TabView is on screen.
            if let tab = Self.debugTab {
                try? await Task.sleep(for: .milliseconds(500))
                withAnimation { selectedTab = tab }
            }
            applyDebugRoute()
            #endif
            await store.refreshIfStale()
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await store.refreshIfStale() }
            }
        }
    }

    #if DEBUG
    /// Simulator verification / store screenshots: `-DebugRoute <route>` opens a screen
    /// directly, e.g. `codes`, `group:sva`, `code:claves:4`, `cheatsheet`, `drugs`,
    /// `drug:adrenalina`, `status4`, `status4:4`, `about`.
    private func applyDebugRoute() {
        guard let route = UserDefaults.standard.string(forKey: "DebugRoute"), let content = store.content else { return }
        let parts = route.split(separator: ":", maxSplits: 2).map(String.init)
        switch parts.first {
        case "drugs": break
        case "status4":
            if parts.count > 1, let n = Int(parts[1]), let entry = content.status4.first(where: { $0.status == n }) {
                path.append(entry)
            }
        case "drug":
            if parts.count > 1, let drug = content.drugs.first(where: { $0.id == parts[1] }) { path.append(drug) }
        case "group":
            if parts.count > 1 { path.append(CodeRoute.group(parts[1])) }
        case "cheatsheet":
            path.append(CodeRoute.cheatsheet)
        case "code":
            if parts.count > 2, let group = content.codeGroups.first(where: { $0.key == parts[1] }),
               let entry = group.entries.first(where: { $0.code == parts[2] }) {
                path.append(CodeRoute.code(groupTitle: group.title, entry: entry))
            }
        case "about": path.append(AppRoute.about)
        default: break
        }
    }
    #endif
}

extension Color {
    /// Brand blue (#1B4FA8) lifted for contrast on the Watch's black background.
    static let samurAccent = Color(red: 0x5B / 255, green: 0x8D / 255, blue: 0xEF / 255)
}
