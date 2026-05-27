import SwiftUI

struct RootView: View {
    @Environment(DataStore.self) private var store
    @Environment(\.horizontalSizeClass) private var sizeClass

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
        TabView {
            Tab("Manual", systemImage: "book.fill") {
                NavigationStack { ManualView() }
            }
            Tab("Códigos", systemImage: "number.square.fill") {
                NavigationStack { CodigosView() }
            }
            Tab("Vademécum", systemImage: "pill.fill") {
                NavigationStack { VademecumView() }
            }
            Tab("Mapa", systemImage: "map.fill") {
                NavigationStack { MapaView() }
            }
        }
        .tint(Color.samurBlue)
    }

    // MARK: - iPad: NavigationSplitView

    @State private var selectedSection: AppSection? = .manual

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
        .tint(Color.samurBlue)
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
