import AppIntents

struct AppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SearchManualIntent(),
      phrases: [
        "Buscar en \\(.applicationName)",
        "Buscar \\(\\.$query) en \\(.applicationName)",
      ],
      shortTitle: "Buscar en el Manual",
      systemImageName: "magnifyingglass"
    )
    AppShortcut(
      intent: OpenManualReferenceIntent(),
      phrases: [
        "Abrir \\(\\.$reference) en \\(.applicationName)",
        "Mostrar \\(\\.$reference) en \\(.applicationName)",
      ],
      shortTitle: "Abrir referencia",
      systemImageName: "book"
    )
  }
}
