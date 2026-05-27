import SwiftUI

struct PerfusionDetailView: View {
    let perfusion: Perfusion
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Drug name section
                Section("Fármaco") {
                    Text(perfusion.drug)
                        .font(.title3.weight(.semibold))
                }

                // Indication
                if let indication = perfusion.indication {
                    Section("Indicación") {
                        Text(indication)
                    }
                }

                // Recipe
                Section("Fórmula") {
                    Text(perfusion.recipe)
                        .font(.body.monospaced())
                    if let alt = perfusion.recipeAlt {
                        Text(alt)
                            .font(.body.monospaced())
                            .foregroundStyle(.secondary)
                    }
                }

                // Rate
                Section("Ritmo de infusión") {
                    Text(perfusion.rate)
                }

                // Preparation steps
                if let prep = perfusion.preparation {
                    Section("Preparación detallada") {
                        Text(prep)
                    }
                }

                // Notes
                if let notes = perfusion.notes {
                    Section("Notas") {
                        Text(notes)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(perfusion.drug)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
