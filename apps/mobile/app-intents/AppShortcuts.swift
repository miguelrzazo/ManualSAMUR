import AppIntents

struct AppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: SearchManualIntent(),
      phrases: [
        "Buscar en \(.applicationName)",
        // A free-text `String` cannot be part of an App Shortcut phrase (only entities
        // and enums can); Shortcuts asks for the query after the phrase instead.
      ],
      shortTitle: "Buscar en el Manual",
      systemImageName: "magnifyingglass"
    )
    AppShortcut(
      intent: OpenManualReferenceIntent(),
      phrases: [
        "Abrir \(\.$reference) en \(.applicationName)",
        "Mostrar \(\.$reference) en \(.applicationName)",
      ],
      shortTitle: "Abrir referencia",
      systemImageName: "book"
    )
  }
}
