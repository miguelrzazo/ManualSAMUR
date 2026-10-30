import SwiftUI

enum CodeRoute: Hashable {
    case group(String)
    case cheatsheet
    case code(groupTitle: String, entry: CodeEntry)
}

struct CodesTab: View {
    @Environment(ContentStore.self) private var store
    @State private var query = ""

    var body: some View {
        NavigationStack {
            Group {
                if let content = store.content {
                    CodesRootList(content: content, query: query)
                } else {
                    EmptyContentView()
                }
            }
            .navigationTitle("Códigos")
            .searchable(text: $query, prompt: "Código o nombre")
            .toolbar { AboutToolbarItem() }
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
        }
    }
}

private struct CodesRootList: View {
    let content: WatchContent
    let query: String

    var body: some View {
        List {
            if query.trimmingCharacters(in: .whitespaces).isEmpty {
                Section {
                    ForEach(content.codeGroups) { group in
                        NavigationLink(value: CodeRoute.group(group.key)) {
                            HStack {
                                Text(group.title)
                                Spacer()
                                Text("\(group.entries.count)")
                                    .font(.footnote.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                    if !content.cheatsheet.isEmpty {
                        NavigationLink(value: CodeRoute.cheatsheet) {
                            Label("Chuleta de radio", systemImage: "list.bullet.rectangle")
                        }
                    }
                }
                DataStatusSection()
            } else {
                let results = CodeSearch.results(in: content.codeGroups, query: query)
                if results.isEmpty {
                    Text("Sin resultados")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(results, id: \.group.key) { result in
                        Section(result.group.title) {
                            ForEach(result.entries, id: \.self) { entry in
                                NavigationLink(value: CodeRoute.code(groupTitle: result.group.title, entry: entry)) {
                                    CodeRow(entry: entry)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

enum CodeSearch {
    struct Result {
        let group: CodeGroup
        let entries: [CodeEntry]
    }

    static let perGroupLimit = 25

    /// Codes whose code starts with the query rank first, then code/name/category matches.
    static func filter(_ entries: [CodeEntry], query: String, limit: Int? = nil) -> [CodeEntry] {
        let key = query.trimmingCharacters(in: .whitespaces).searchKey
        guard !key.isEmpty else { return entries }
        var prefix: [CodeEntry] = []
        var other: [CodeEntry] = []
        for entry in entries {
            let code = entry.code.searchKey
            if code.hasPrefix(key) {
                prefix.append(entry)
            } else if code.contains(key)
                        || entry.name.searchKey.contains(key)
                        || (entry.description?.searchKey.contains(key) ?? false)
                        || (entry.category?.searchKey.contains(key) ?? false) {
                other.append(entry)
            }
        }
        let all = prefix + other
        if let limit { return Array(all.prefix(limit)) }
        return all
    }

    static func results(in groups: [CodeGroup], query: String) -> [Result] {
        groups.compactMap { group in
            let entries = filter(group.entries, query: query, limit: perGroupLimit)
            return entries.isEmpty ? nil : Result(group: group, entries: entries)
        }
    }
}

struct CodeRow: View {
    let entry: CodeEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Text(entry.code)
                    .font(.system(.headline, design: .rounded).monospacedDigit())
                    .foregroundStyle(.tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if entry.tetra == true {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.caption2)
                        .foregroundStyle(.cyan)
                        .accessibilityLabel("TETRA y llamada de voz")
                }
                if entry.noReport == true {
                    Image(systemName: "doc.badge.ellipsis")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Sin informe asistencial")
                }
            }
            Text(entry.name)
                .font(.footnote)
                .lineLimit(3)
        }
        .accessibilityElement(children: .combine)
    }
}

struct CodeGroupView: View {
    let group: CodeGroup
    @State private var query = ""

    private var sections: [(category: String, entries: [CodeEntry])] {
        let filtered = CodeSearch.filter(group.entries, query: query)
        var order: [String] = []
        var buckets: [String: [CodeEntry]] = [:]
        for entry in filtered {
            let category = entry.category ?? entry.group ?? ""
            if buckets[category] == nil { order.append(category) }
            buckets[category, default: []].append(entry)
        }
        return order.map { ($0, buckets[$0] ?? []) }
    }

    var body: some View {
        List {
            let sections = sections
            if sections.isEmpty {
                Text("Sin resultados").foregroundStyle(.secondary)
            }
            ForEach(sections, id: \.category) { section in
                Section(section.category) {
                    ForEach(section.entries, id: \.self) { entry in
                        NavigationLink(value: CodeRoute.code(groupTitle: group.title, entry: entry)) {
                            CodeRow(entry: entry)
                        }
                    }
                }
            }
        }
        .navigationTitle(group.title)
        .searchable(text: $query, prompt: "Buscar en \(group.title)")
    }
}

struct CodeDetailView: View {
    let groupTitle: String
    let entry: CodeEntry

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text(entry.code)
                    .font(.system(.title2, design: .rounded).weight(.bold).monospacedDigit())
                    .foregroundStyle(.tint)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(entry.name)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)
                DetailBlock(title: "Descripción", text: entry.extraDescription)
                DetailBlock(title: "Categoría", text: entry.category)
                DetailBlock(title: "Grupo", text: entry.group)
                if entry.tetra == true {
                    Label("Transmitir por TETRA y llamada de voz", systemImage: "antenna.radiowaves.left.and.right")
                        .font(.footnote)
                        .foregroundStyle(.cyan)
                }
                if entry.noReport == true {
                    Label("Sin informe asistencial", systemImage: "doc.badge.ellipsis")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle(groupTitle)
    }
}

struct CheatsheetView: View {
    let sections: [CheatsheetSection]

    var body: some View {
        List {
            ForEach(sections, id: \.key) { section in
                Section(section.title) {
                    ForEach(section.rows) { row in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.title).font(.footnote.weight(.semibold))
                            if !row.detail.isEmpty {
                                Text(row.detail)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .accessibilityElement(children: .combine)
                    }
                }
            }
        }
        .navigationTitle("Chuleta")
    }
}
