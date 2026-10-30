import SwiftUI

/// "Datos del <fecha>" plus a manual refresh, shown at the end of every tab and in Acerca de.
struct DataStatusSection: View {
    @Environment(ContentStore.self) private var store

    var body: some View {
        Section {
            Button {
                Task { await store.refresh() }
            } label: {
                HStack {
                    Label("Actualizar", systemImage: "arrow.clockwise")
                    Spacer()
                    if store.isRefreshing {
                        ProgressView().frame(width: 20, height: 20)
                    }
                }
            }
            .disabled(store.isRefreshing)
        } footer: {
            VStack(alignment: .leading, spacing: 2) {
                if let content = store.content {
                    Text("Datos del \(content.publishedDateText)")
                }
                if let error = store.lastError {
                    Text(error).foregroundStyle(.orange)
                }
            }
        }
    }
}

/// Toolbar entry to the About screen, shared by the three tabs.
struct AboutToolbarItem: ToolbarContent {
    var body: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            NavigationLink {
                AboutView()
            } label: {
                Image(systemName: "info.circle")
            }
            .accessibilityLabel("Acerca de")
        }
    }
}

struct EmptyContentView: View {
    var body: some View {
        ContentUnavailableView {
            Label("Sin datos", systemImage: "icloud.slash")
        } description: {
            Text("Conecta el reloj a internet o abre la app en el iPhone.")
        }
    }
}

/// Titled block of free text used by the detail screens.
struct DetailBlock: View {
    let title: String
    let text: String?
    var emphasized = false

    var body: some View {
        if let text, !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)
                Text(text)
                    .font(emphasized ? .body : .footnote)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
        }
    }
}
