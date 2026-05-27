import SwiftUI

struct ManualView: View {
    @Environment(DataStore.self) private var store
    @State private var searchText = ""

    var body: some View {
        Group {
            if searchText.isEmpty {
                sectionedList
            } else {
                searchResults
            }
        }
        .navigationTitle("Manual")
        .searchable(text: $searchText, prompt: "Buscar procedimiento…")
    }

    // MARK: - Sections list

    private var sectionedList: some View {
        List {
            ForEach(store.proceduresBySection, id: \.section) { group in
                Section {
                    ForEach(group.items) { procedure in
                        NavigationLink(value: procedure) {
                            ProcedureRow(procedure: procedure)
                        }
                    }
                } header: {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color(hex: group.items.first?.sectionColor ?? "#64748B"))
                            .frame(width: 8, height: 8)
                        Text(group.items.first?.sectionDisplayName ?? group.section.capitalized)
                            .font(.subheadline.weight(.semibold))
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationDestination(for: Procedure.self) { procedure in
            ProcedureDetailView(procedure: procedure)
        }
    }

    // MARK: - Search results

    private var searchResults: some View {
        let results = store.procedures.filter { $0.matches(searchText) }
        return Group {
            if results.isEmpty {
                EmptySearchView(query: searchText)
            } else {
                List(results) { procedure in
                    NavigationLink(value: procedure) {
                        ProcedureRow(procedure: procedure, showSection: true)
                    }
                }
                .navigationDestination(for: Procedure.self) { procedure in
                    ProcedureDetailView(procedure: procedure)
                }
            }
        }
    }
}

// MARK: - Row

private struct ProcedureRow: View {
    let procedure: Procedure
    var showSection: Bool = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 4)
                .fill(procedure.color)
                .frame(width: 4, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(procedure.title)
                    .font(.body)
                    .lineLimit(2)

                HStack(spacing: 6) {
                    Text(procedure.id)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)

                    if showSection {
                        SectionBadge(label: procedure.sectionDisplayName, color: procedure.color)
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }
}
