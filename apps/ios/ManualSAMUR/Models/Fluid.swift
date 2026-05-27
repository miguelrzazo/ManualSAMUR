import Foundation

struct Fluid: Codable, Identifiable {
    let id: String
    let name: String
    let presentation: String?
    let type: String
    let osmolarity: String?
    let sodium: String?
    let chloride: String?
    let glucose: String?
    let calcium: String?
    let potassium: String?
    let lactate: String?
    let pH: String?
    let contraindications: [String]?

    private enum CodingKeys: String, CodingKey {
        case id, name, presentation, type, osmolarity, sodium, chloride,
             glucose, calcium, potassium, lactate, pH = "ph",
             contraindications
    }
}
