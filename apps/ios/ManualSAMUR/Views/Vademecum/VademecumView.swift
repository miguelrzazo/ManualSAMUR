import SwiftUI

struct VademecumView: View {
    @Environment(DataStore.self) private var store
    @State private var searchText = ""
    @State private var selectedDrug: Drug?

    private var filteredByCategory: [(category: String, items: [Drug])] {
        if searchText.isEmpty {
            return store.drugsByCategory
        }
        let q = searchText.lowercased()
        var grouped: [String: [Drug]] = [:]
        for d in store.drugs where d.matches(searchText) {
            grouped[d.category, default: []].append(d)
        }
        return grouped.sorted { $0.key < $1.key }.map { (category: $0.key, items: $0.value) }
    }

    var body: some View {
        Group {
            if filteredByCategory.isEmpty && !searchText.isEmpty {
                EmptySearchView(query: searchText)
            } else {
                List {
                    ForEach(filteredByCategory, id: \.category) { group in
                        Section(group.category) {
                            ForEach(group.items) { drug in
                                DrugRow(drug: drug)
                                    .contentShape(Rectangle())
                                    .onTapGesture { selectedDrug = drug }
                            }
                        }
                    }
                }
                .listStyle(.insetGrouped)
            }
        }
        .navigationTitle("Vademécum")
        .searchable(text: $searchText, prompt: "Buscar fármaco…")
        .sheet(item: $selectedDrug) { drug in
            DrugDetailView(drug: drug)
                .presentationDetents([.large])
        }
    }
}

// MARK: - Row

private struct DrugRow: View {
    let drug: Drug

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(drug.name)
                .font(.body)
            if let synonyms = drug.synonyms, !synonyms.isEmpty {
                Text(synonyms.prefix(3).joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}
