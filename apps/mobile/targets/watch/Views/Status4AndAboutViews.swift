import SwiftUI

struct Status4Tab: View {
    @Environment(ContentStore.self) private var store

    var body: some View {
        NavigationStack {
            Group {
                if let content = store.content {
                    List {
                        Section {
                            ForEach(content.status4) { entry in
                                NavigationLink(value: entry) {
                                    Status4Row(entry: entry)
                                }
                            }
                        } footer: {
                            Text("Status 4 + Status N: hospital de destino.")
                        }
                        DataStatusSection()
                    }
                } else {
                    EmptyContentView()
                }
            }
            .navigationTitle("Status 4")
            .toolbar { AboutToolbarItem() }
            .navigationDestination(for: Status4Entry.self) { entry in
                Status4DetailView(entry: entry)
            }
        }
    }
}

private struct Status4Row: View {
    let entry: Status4Entry

    var body: some View {
        HStack(spacing: 8) {
            Text("\(entry.status)")
                .font(.system(.title3, design: .rounded).weight(.bold).monospacedDigit())
                .foregroundStyle(.tint)
                .frame(minWidth: 26)
            VStack(alignment: .leading, spacing: 0) {
                Text(entry.title)
                    .font(.footnote.weight(.semibold))
                    .lineLimit(2)
                if let id = entry.hospitalId {
                    Text(id)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else if let meaning = entry.meaning {
                    Text(meaning)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Status \(entry.status): \(entry.title)")
    }
}

private struct Status4DetailView: View {
    let entry: Status4Entry

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 8) {
                Text("Status 4 + \(entry.status)")
                    .font(.system(.title3, design: .rounded).weight(.bold).monospacedDigit())
                    .foregroundStyle(.tint)
                Text(entry.title)
                    .font(.headline)
                DetailBlock(title: "Código", text: entry.hospitalId)
                DetailBlock(title: "Significado", text: entry.meaning)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Status 4")
    }
}

struct AboutView: View {
    @Environment(ContentStore.self) private var store

    var body: some View {
        List {
            Section {
                Text("Guía de consulta no oficial.")
                    .font(.footnote.weight(.semibold))
                Text("Sin afiliación con SAMUR-Protección Civil ni con el Ayuntamiento de Madrid.")
                    .font(.footnote)
                Text("No sustituye el juicio clínico ni los protocolos vigentes.")
                    .font(.footnote)
            }
            Section("Datos") {
                if let content = store.content {
                    LabeledContent("Fecha", value: content.publishedDateText)
                    LabeledContent("Origen", value: content.origin.label)
                } else {
                    Text("Sin datos guardados")
                }
                if let checked = store.lastSuccessfulCheck {
                    LabeledContent("Comprobado") {
                        Text(checked, format: .relative(presentation: .named))
                    }
                }
            }
            DataStatusSection()
            Section {
                Text("Manual SAMUR para Apple Watch")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Acerca de")
    }
}
