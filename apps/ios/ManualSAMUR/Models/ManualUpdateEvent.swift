import Foundation

struct ManualUpdateEvent: Codable, Identifiable {
    let eventId: String
    let changeKind: String
    let summary: String
    let effectiveDate: String
    let approvedAt: String?
    let isNewThisWeek: Bool
    let diff: String?
    let category: String?
    let procedureIds: [String]
    let origin: String?
    let officialUrl: String?

    var id: String { eventId }
}

struct ManualUpdatesPayload: Codable {
    let generatedAt: String
    let events: [ManualUpdateEvent]
}
