import SwiftUI

struct DrugsTab: View {
    @Environment(ContentStore.self) private var store
    @State private var query = ""

    var body: some View {
        NavigationStack {
            Group {
                if let content = store.content {
                    DrugsList(content: content, query: query)
                } else {
                    EmptyContentView()
                }
            }
            .navigationTitle("Vademécum")
            .searchable(text: $query, prompt: "Fármaco o nombre comercial")
            .toolbar { AboutToolbarItem() }
            .navigationDestination(for: Drug.self) { drug in
                DrugDetailView(drug: drug, commercial: store.content?.commercialNames.filter { $0.drugId == drug.id } ?? [])
            }
        }
    }
}

private struct DrugsList: View {
    let content: WatchContent
    let query: String

    var body: some View {
        let matches = DrugSearch.matches(in: content, query: query)
        List {
            if matches.isEmpty {
                Text("Sin resultados").foregroundStyle(.secondary)
            }
            ForEach(matches, id: \.drug.id) { match in
                NavigationLink(value: match.drug) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(match.drug.name)
                            .font(.headline)
                            .lineLimit(2)
                        if let via = match.matchedAlias {
                            Text(via)
                                .font(.caption2)
                                .foregroundStyle(.tint)
                                .lineLimit(1)
                        } else if let category = match.drug.subcategory ?? match.drug.category {
                            Text(category)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(1)
                        }
                    }
                    .accessibilityElement(children: .combine)
                }
            }
            if query.isEmpty {
                DataStatusSection()
            }
        }
    }
}

enum DrugSearch {
    struct Match {
        let drug: Drug
        /// Set when the drug matched through a synonym or a commercial name rather than its own name.
        let matchedAlias: String?
    }

    static func matches(in content: WatchContent, query: String) -> [Match] {
        let key = query.trimmingCharacters(in: .whitespaces).searchKey
        guard !key.isEmpty else { return content.drugs.map { Match(drug: $0, matchedAlias: nil) } }

        var brandsByDrug: [String: [String]] = [:]
        for entry in content.commercialNames {
            brandsByDrug[entry.drugId, default: []].append(contentsOf: entry.brandNames + [entry.activeIngredient].compactMap { $0 })
        }

        var byName: [Match] = []
        var byAlias: [Match] = []
        for drug in content.drugs {
            if drug.name.searchKey.contains(key) {
                byName.append(Match(drug: drug, matchedAlias: nil))
            } else if let synonym = drug.synonyms?.first(where: { $0.searchKey.contains(key) }) {
                byAlias.append(Match(drug: drug, matchedAlias: synonym))
            } else if let brand = brandsByDrug[drug.id]?.first(where: { $0.searchKey.contains(key) }) {
                byAlias.append(Match(drug: drug, matchedAlias: brand))
            } else if (drug.category?.searchKey.contains(key) ?? false) || (drug.subcategory?.searchKey.contains(key) ?? false) {
                byAlias.append(Match(drug: drug, matchedAlias: nil))
            }
        }
        let prefix = byName.filter { $0.drug.name.searchKey.hasPrefix(key) }
        let rest = byName.filter { !$0.drug.name.searchKey.hasPrefix(key) }
        return prefix + rest + byAlias
    }
}

struct DrugDetailView: View {
    let drug: Drug
    let commercial: [CommercialName]

    private var brandNames: String? {
        let names = commercial.flatMap(\.brandNames)
        return names.isEmpty ? nil : names.map { "• \($0)" }.joined(separator: "\n")
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(drug.name)
                        .font(.headline)
                        .fixedSize(horizontal: false, vertical: true)
                    if let category = drug.subcategory ?? drug.category {
                        Text(category)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                DetailBlock(title: "Dosis", text: drug.dose, emphasized: true)
                DetailBlock(title: "Vía", text: drug.route?.joined(separator: ", "))
                DetailBlock(title: "Presentación", text: drug.presentation)
                DetailBlock(title: "Indicación", text: drug.indication)
                DetailBlock(title: "Contraindicaciones", text: drug.contraindications)
                DetailBlock(title: "Precauciones", text: drug.precauciones)
                DetailBlock(title: "Incompatibilidades", text: drug.incompatibilidades)
                DetailBlock(title: "Notas", text: drug.notes)
                DetailBlock(title: "Nombres comerciales", text: brandNames)
                DetailBlock(title: "Sinónimos", text: drug.synonyms.flatMap { $0.isEmpty ? nil : $0.joined(separator: ", ") })
                Text("Verifica siempre la dosis con el protocolo vigente.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Vademécum")
    }
}
