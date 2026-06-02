import Foundation
import SwiftUI

struct Drug: Codable, Identifiable {
    let id: String
    let name: String
    let synonyms: [String]?
    let category: String
    let subcategory: String?
    let presentation: String?
    let funcion: String?
    let indication: String?
    let dose: String?
    let route: [String]?
    let contraindications: String?
    let efectos_secundarios: String?
    let notes: String?

    static func colorFor(category: String) -> Color {
        switch category {
        case "Analgesia y Sedación": return .purple
        case "Antídotos":            return .orange
        case "Cardiovascular":       return .red
        case "Fluidos IV":           return .blue
        case "Metabólico":           return Color(.systemYellow)
        case "Neurológico":          return .teal
        case "Obstétrico":           return .pink
        case "Psiquiátrico":         return .green
        case "Respiratorio":         return Color(.systemCyan)
        default:                     return .gray
        }
    }

    var categoryColor: Color { Drug.colorFor(category: category) }

    func matches(_ query: String) -> Bool {
        let q = query.lowercased()
        if name.lowercased().contains(q) { return true }
        if let synonyms, synonyms.contains(where: { $0.lowercased().contains(q) }) { return true }
        if category.lowercased().contains(q) { return true }
        return false
    }
}
