import SwiftUI

struct RootView: View {
    @Environment(DataStore.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass

    @State private var selectedTab: AppSection
    @State private var selectedSection: AppSection?

    init() {
        let raw = UserDefaults.standard.string(forKey: "app.defaultTab") ?? "manual"
        let initial = AppSection(rawValue: raw) ?? .manual
        _selectedTab = State(initialValue: initial)
        _selectedSection = State(initialValue: initial)
    }

    var body: some View {
        Group {
            if sizeClass == .regular {
                iPadLayout
            } else {
                iPhoneLayout
            }
        }
        .overlay {
            if store.loadingState == .loading && store.procedures.isEmpty {
                LoadingView()
            }
        }
    }

    // MARK: - iPhone: TabView

    private var iPhoneLayout: some View {
        TabView(selection: $selectedTab) {
            Tab("Manual", systemImage: "book.fill", value: AppSection.manual) {
                NavigationStack { ManualView() }
            }
            .badge(store.unseenEventCount > 0 ? store.unseenEventCount : 0)
            Tab("Códigos", systemImage: "number.square.fill", value: AppSection.codigos) {
                NavigationStack { CodigosView() }
            }
            Tab("Vademécum", systemImage: "pill.fill", value: AppSection.vademecum) {
                NavigationStack { VademecumView() }
            }
            Tab("Mapa", systemImage: "map.fill", value: AppSection.mapa) {
                NavigationStack { MapaView() }
            }
        }
        .tint(Color.samurPrimary)
    }

    // MARK: - iPad: NavigationSplitView

    private var iPadLayout: some View {
        NavigationSplitView {
            List(AppSection.allCases, selection: $selectedSection) { section in
                Label(section.title, systemImage: section.icon)
                    .tag(section)
            }
            .navigationTitle("SAMUR Manual")
        } detail: {
            switch selectedSection {
            case .manual:    ManualView()
            case .codigos:   CodigosView()
            case .vademecum: VademecumView()
            case .mapa:      MapaView()
            case .none:      ManualView()
            }
        }
        .tint(Color.samurPrimary)
    }
}

enum AppSection: String, CaseIterable, Identifiable {
    case manual, codigos, vademecum, mapa
    var id: String { rawValue }

    var title: String {
        switch self {
        case .manual:    return "Manual"
        case .codigos:   return "Códigos"
        case .vademecum: return "Vademécum"
        case .mapa:      return "Mapa"
        }
    }

    var icon: String {
        switch self {
        case .manual:    return "book.fill"
        case .codigos:   return "number.square.fill"
        case .vademecum: return "pill.fill"
        case .mapa:      return "map.fill"
        }
    }
}
