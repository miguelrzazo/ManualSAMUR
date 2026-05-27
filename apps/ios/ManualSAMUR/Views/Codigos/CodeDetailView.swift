import SwiftUI

struct CodeDetailView: View {
    let code: Code
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Text(code.code)
                            .font(.title2.monospaced().weight(.bold))
                            .foregroundStyle(Color.samurBlue)
                        Spacer()
                        if let category = code.category {
                            SectionBadge(label: category, color: Color.samurBlue)
                        }
                    }
                    Text(code.name)
                        .font(.title3.weight(.semibold))
                }

                if let description = code.description, !description.isEmpty {
                    Section("Descripción") {
                        Text(description)
                            .font(.body)
                    }
                }

                Section {
                    LabeledContent("Tipo") {
                        Text(codigoTypeLabels[code.type] ?? code.type)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Código \(code.code)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
