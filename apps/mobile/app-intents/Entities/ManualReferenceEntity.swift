import AppIntents
internal import ExpoAppIntents
import Foundation

private func normalizeManualText(_ value: String) -> String {
  value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
    .trimmingCharacters(in: .whitespacesAndNewlines)
}

struct ManualReferenceEntity: AppEntity {
  static let typeDisplayRepresentation: TypeDisplayRepresentation = "Referencia del Manual"
  static let defaultQuery = ManualReferenceQuery()

  var id: String
  @Property(title: "Nombre") var name: String
  var subtitle: String?
  var synonyms: [String]

  var displayRepresentation: DisplayRepresentation {
    if #available(iOS 17.0, *) {
      if let subtitle {
        return DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)", synonyms: synonyms.map { LocalizedStringResource(stringLiteral: $0) })
      }
      return DisplayRepresentation(title: "\(name)", synonyms: synonyms.map { LocalizedStringResource(stringLiteral: $0) })
    }
    if let subtitle {
      return DisplayRepresentation(title: "\(name)", subtitle: "\(subtitle)")
    }
    return DisplayRepresentation(title: "\(name)")
  }

  init(record: AppIntentEntityRecord) {
    id = record.id
    name = record.title
    subtitle = record.subtitle
    synonyms = record.synonyms
  }

  func matches(_ text: String) -> Bool {
    let query = normalizeManualText(text)
    guard !query.isEmpty else { return false }
    return ([id, name] + synonyms).map(normalizeManualText).contains { $0.contains(query) || query.contains($0) }
  }
}

struct ManualReferenceQuery: EntityStringQuery {
  func entities(for identifiers: [String]) async throws -> [ManualReferenceEntity] {
    try await AppIntentEntityStore.shared.entities(ofKind: "manualReference", matching: identifiers).map(ManualReferenceEntity.init(record:))
  }

  func suggestedEntities() async throws -> [ManualReferenceEntity] {
    try await AppIntentEntityStore.shared.entities(ofKind: "manualReference").map(ManualReferenceEntity.init(record:))
  }

  func entities(matching string: String) async throws -> [ManualReferenceEntity] {
    try await suggestedEntities().filter { $0.matches(string) }
  }
}
