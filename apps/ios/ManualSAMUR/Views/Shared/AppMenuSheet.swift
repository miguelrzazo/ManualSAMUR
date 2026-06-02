import SwiftUI

struct AppMenuSheet: View {
    @Environment(\.dismiss) private var dismiss
    @AppStorage("app.appearance") private var appearance = "auto"
    @AppStorage("app.defaultTab") private var defaultTab = "manual"
    @State private var showAbreviaturas = false

    private var appVersion: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }

    var body: some View {
        NavigationStack {
            List {
                // Brand header
                Section {
                    HStack(spacing: 14) {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(Color.samurPrimary)
                            .frame(width: 44, height: 44)
                            .overlay(
                                Text("S")
                                    .font(.samurTitle3)
                                    .foregroundStyle(.white)
                            )

                        VStack(alignment: .leading, spacing: 2) {
                            Text("SAMUR Manual")
                                .font(.samurHeadline)
                            Text("Madrid SAMUR-PC")
                                .font(.samurCaption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        Text(appVersion)
                            .font(.samurMono)
                            .foregroundStyle(.secondary)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 6))
                    }
                    .padding(.vertical, 4)
                }

                // Quick access
                Section {
                    Button {
                        showAbreviaturas = true
                    } label: {
                        Label("Abreviaturas médicas", systemImage: "textformat.abc")
                            .font(.samurBody)
                            .foregroundStyle(.primary)
                    }
                }

                // Settings
                Section("Ajustes") {
                    Picker(selection: $appearance) {
                        Text("Automático").tag("auto")
                        Text("Claro").tag("light")
                        Text("Oscuro").tag("dark")
                    } label: {
                        Label("Apariencia", systemImage: "circle.lefthalf.filled")
                            .font(.samurBody)
                    }

                    Picker(selection: $defaultTab) {
                        Text("Manual").tag("manual")
                        Text("Códigos").tag("codigos")
                        Text("Vademécum").tag("vademecum")
                        Text("Mapa").tag("mapa")
                    } label: {
                        Label("Pestaña inicial", systemImage: "house")
                            .font(.samurBody)
                    }
                }

                // Legal
                Section("Legal") {
                    DisclosureGroup {
                        Text("Esta aplicación es una adaptación no oficial del Manual SAMUR-PC, creada con fines educativos y de consulta rápida para el personal del SAMUR. No tiene carácter oficial. Ante cualquier duda, consulta siempre el manual oficial vigente.")
                            .font(.samurFootnote)
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 4)
                    } label: {
                        Label("Aviso de uso", systemImage: "exclamationmark.triangle")
                            .font(.samurBody)
                    }

                    DisclosureGroup {
                        Text("Esta aplicación solo utiliza cookies propias, estrictamente necesarias para el funcionamiento básico. No se comparten datos con terceros.")
                            .font(.samurFootnote)
                            .foregroundStyle(.secondary)
                            .padding(.vertical, 4)
                    } label: {
                        Label("Política de privacidad", systemImage: "hand.raised")
                            .font(.samurBody)
                    }
                }

                // Contact
                Section("Contacto") {
                    Link(destination: URL(string: "mailto:mrosaz00@estudiantes.unileon.es?subject=Manual%20SAMUR%20iOS%20Feedback")!) {
                        Label("Enviar comentarios", systemImage: "envelope")
                            .font(.samurBody)
                    }
                    Link(destination: URL(string: "https://www.madrid.es/portales/munimadrid/es/Inicio/El-Ayuntamiento/SAMUR-Proteccion-Civil/")!) {
                        Label("Web oficial SAMUR", systemImage: "globe")
                            .font(.samurBody)
                    }
                }

                // About
                Section("Sobre la app") {
                    LabeledContent("Autor") {
                        Text("Miguel Rosa · Vol. 15970")
                            .font(.samurBody)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Menú")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                        .font(.samurBody)
                }
            }
        }
        .sheet(isPresented: $showAbreviaturas) {
            AbreviaturasView()
        }
    }
}
