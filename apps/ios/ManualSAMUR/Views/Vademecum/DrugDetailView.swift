import SwiftUI

struct DrugDetailView: View {
    let drug: Drug
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Header
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(drug.name)
                            .font(.title2.weight(.bold))
                        if let synonyms = drug.synonyms, !synonyms.isEmpty {
                            Text(synonyms.joined(separator: " · "))
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.vertical, 4)

                    if let subcategory = drug.subcategory {
                        LabeledContent("Categoría") {
                            Text("\(drug.category) · \(subcategory)")
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.trailing)
                        }
                    } else {
                        LabeledContent("Categoría") {
                            Text(drug.category)
                                .foregroundStyle(.secondary)
                        }
                    }

                    if let routes = drug.route, !routes.isEmpty {
                        LabeledContent("Vía") {
                            Text(routes.joined(separator: ", "))
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if let presentation = drug.presentation, !presentation.isEmpty {
                    Section("Presentación") {
                        Text(presentation)
                    }
                }

                if let funcion = drug.funcion, !funcion.isEmpty {
                    Section("Función") {
                        Text(funcion)
                    }
                }

                if let indication = drug.indication, !indication.isEmpty {
                    Section("Indicaciones") {
                        Text(indication)
                    }
                }

                if let dose = drug.dose, !dose.isEmpty {
                    Section("Dosis") {
                        Text(dose)
                            .font(.body.monospaced())
                    }
                }

                if let contra = drug.contraindications, !contra.isEmpty {
                    Section("Contraindicaciones") {
                        Text(contra)
                            .foregroundStyle(.red.mix(with: .primary, by: 0.3))
                    }
                }

                if let effects = drug.efectos_secundarios, !effects.isEmpty {
                    Section("Efectos secundarios") {
                        Text(effects)
                    }
                }

                if let notes = drug.notes, !notes.isEmpty {
                    Section("Notas") {
                        Text(notes)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(drug.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
