import AppIntents
internal import ExpoAppIntents

struct OpenManualReferenceIntent: AppIntent {
  static let title: LocalizedStringResource = "Abrir referencia del Manual"
  static let openAppWhenRun = true

  @Parameter(title: "Referencia") var reference: ManualReferenceEntity

  static var parameterSummary: some ParameterSummary { Summary("Abrir \(\.$reference)") }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    await AppIntentDispatcher.shared.dispatch(name: "openManualReference", params: ["routeKey": .string(reference.id)])
    return .result(dialog: "Abriendo el Manual SAMUR.")
  }
}

struct SearchManualIntent: AppIntent {
  static let title: LocalizedStringResource = "Buscar en el Manual SAMUR"
  static let openAppWhenRun = true

  @Parameter(title: "Texto de búsqueda") var query: String

  static var parameterSummary: some ParameterSummary { Summary("Buscar \(\.$query) en el Manual SAMUR") }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let value = query.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !value.isEmpty else { throw $query.needsValueError("¿Qué quieres buscar en el manual?") }
    await AppIntentDispatcher.shared.dispatch(name: "searchManual", params: ["query": .string(value)])
    return .result(dialog: "Abriendo la búsqueda en Manual SAMUR.")
  }
}
