import SwiftUI

struct FluidDetailView: View {
    let fluid: Fluid
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                // Basic info
                Section("Información") {
                    LabeledContent("Tipo", value: fluid.type)
                    if let presentation = fluid.presentation {
                        LabeledContent("Presentación", value: presentation)
                    }
                }

                // Electrolytes / composition table
                Section("Composición") {
                    if let v = fluid.osmolarity { LabeledContent("Osmolaridad", value: v) }
                    if let v = fluid.sodium     { LabeledContent("Sodio (Na⁺)", value: v) }
                    if let v = fluid.chloride   { LabeledContent("Cloro (Cl⁻)", value: v) }
                    if let v = fluid.potassium  { LabeledContent("Potasio (K⁺)", value: v) }
                    if let v = fluid.calcium    { LabeledContent("Calcio (Ca²⁺)", value: v) }
                    if let v = fluid.lactate    { LabeledContent("Lactato", value: v) }
                    if let v = fluid.glucose    { LabeledContent("Glucosa", value: v) }
                    if let v = fluid.pH         { LabeledContent("pH", value: v) }
                }

                // Contraindications
                if let ci = fluid.contraindications, !ci.isEmpty {
                    Section("Contraindicaciones") {
                        ForEach(ci, id: \.self) { item in
                            Label(item, systemImage: "exclamationmark.triangle.fill")
                                .foregroundStyle(.red, .red)
                                .font(.subheadline)
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle(fluid.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
