import Foundation
import SwiftUI

struct Procedure: Codable, Identifiable, Hashable {
    let id: String
    let title: String
    let section: String
    let sectionColor: String
    let content: String
    let updated: String?

    var sectionDisplayName: String {
        switch section {
        case "sva": return "SVA"
        case "svb": return "SVB"
        case "operativos": return "Operativos"
        case "administrativos": return "Administrativos"
        case "comunicaciones": return "Comunicaciones"
        case "tecnicas": return "Técnicas"
        case "psicologicos": return "Psicológicos"
        case "drp": return "DRP"
        case "intervinientes": return "Intervinientes"
        case "general": return "General"
        default: return section.capitalized
        }
    }

    var color: Color { Color(hex: sectionColor) }

    func matches(_ query: String) -> Bool {
        let q = query.lowercased()
        return title.lowercased().contains(q) || id.lowercased().contains(q)
    }
}
