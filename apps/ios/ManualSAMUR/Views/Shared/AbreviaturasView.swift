import SwiftUI

// MARK: - Models

private struct AbrevSection: Decodable {
    let letter: String
    let entries: [AbrevEntry]
}

private struct AbrevEntry: Decodable, Identifiable {
    let abbreviation: String
    let meaning: String
    var id: String { abbreviation }
}

// MARK: - View

struct AbreviaturasView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var sections: [AbrevSection] = []

    private var filteredSections: [(letter: String, entries: [AbrevEntry])] {
        if searchText.isEmpty {
            return sections.map { (letter: $0.letter, entries: $0.entries) }
        }
        let q = searchText.folding(options: .diacriticInsensitive, locale: .current).lowercased()
        var grouped: [String: [AbrevEntry]] = [:]
        for section in sections {
            for entry in section.entries {
                let abrv = entry.abbreviation.folding(options: .diacriticInsensitive, locale: .current).lowercased()
                let mean = entry.meaning.folding(options: .diacriticInsensitive, locale: .current).lowercased()
                if abrv.contains(q) || mean.contains(q) {
                    let key = String(entry.abbreviation.prefix(1)).uppercased()
                    grouped[key, default: []].append(entry)
                }
            }
        }
        return grouped.sorted { $0.key < $1.key }.map { (letter: $0.key, entries: $0.value) }
    }

    private var totalCount: Int {
        filteredSections.reduce(0) { $0 + $1.entries.count }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                Divider()
                countLabel
                Divider()
                termsList
            }
            .navigationTitle("Abreviaturas")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
        .onAppear { loadData() }
    }

    // MARK: - Subviews

    private var searchBar: some View {
        HStack {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Buscar abreviatura…", text: $searchText)
                .autocorrectionDisabled()
                .textInputAutocapitalization(.never)
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
    }

    private var countLabel: some View {
        HStack {
            Text("\(totalCount) términos")
                .font(.samurCaption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
        .background(Color(.systemGroupedBackground))
    }

    private var termsList: some View {
        List {
            ForEach(filteredSections, id: \.letter) { section in
                Section(section.letter) {
                    ForEach(section.entries) { entry in
                        HStack(alignment: .firstTextBaseline, spacing: 12) {
                            Text(entry.abbreviation)
                                .font(.samurBody.weight(.semibold))
                                .frame(minWidth: 80, alignment: .leading)
                            Text(entry.meaning)
                                .font(.samurBody)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if filteredSections.isEmpty && !searchText.isEmpty {
                ContentUnavailableView.search(text: searchText)
            }
        }
        .listStyle(.insetGrouped)
    }

    // MARK: - Data

    private func loadData() {
        guard sections.isEmpty,
              let url = Bundle.main.url(forResource: "abreviaturas", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let decoded = try? JSONDecoder().decode([AbrevSection].self, from: data)
        else { return }
        sections = decoded
    }
}
