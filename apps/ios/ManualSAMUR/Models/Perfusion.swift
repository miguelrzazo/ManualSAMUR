import Foundation

struct Perfusion: Codable, Identifiable {
    let id: String
    let drug: String
    let drugId: String?
    let category: String
    let indication: String?
    let recipe: String
    let recipeAlt: String?
    let rate: String
    let preparation: String?
    let notes: String?
}
