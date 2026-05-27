import Foundation

/// Represents a commercial drug entry from vademecum-comerciales.json.
/// The JSON uses { drugId, activeIngredient, presentation, brandNames }
/// rather than the simpler { id, commercial, generic, genericId, category }
/// shape described in the plan.
struct CommercialDrug: Codable, Identifiable {
    let drugId: String
    let activeIngredient: String
    let presentation: String?
    let brandNames: [String]

    /// Stable identity — drugId is unique per entry.
    var id: String { drugId }
}
