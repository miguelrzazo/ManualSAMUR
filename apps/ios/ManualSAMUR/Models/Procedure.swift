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

    var isFlatSection: Bool {
        ["administrativos", "comunicaciones", "drp", "intervinientes"].contains(section)
    }

    var sidebarGroup: String { sidebarMeta.group }
    var sidebarSubgroup: String { sidebarMeta.subgroup }

    private var sidebarMeta: (group: String, subgroup: String) {
        let numericPart = id.split(separator: "_").first.map(String.init) ?? id
        let num = Int(numericPart.filter { $0.isNumber }) ?? 0
        let lowerTitle = title.lowercased()

        switch section {
        case "administrativos", "comunicaciones", "drp", "intervinientes":
            return ("Procedimientos", "Listado")

        case "operativos":
            if id.hasPrefix("217_") {
                return ("Coordinación interservicios", "Actuaciones conjuntas")
            }
            if id.lowercased().hasPrefix("216") {
                let subgroup = lowerTitle.contains("ébola") || id.lowercased().hasSuffix("216c") || id.lowercased().hasSuffix("216d")
                    ? "Patógenos de alto riesgo"
                    : "Exposiciones biológicas"
                return ("Riesgo biológico e infeccioso", subgroup)
            }
            if num >= 212 && num <= 215 {
                return ("Códigos especiales", "Protocolos de activación")
            }
            return ("Actuación operativa", "Incidentes y coordinación")

        case "sva":
            if num <= 303 || num == 316 {
                return ("Soporte vital y vía aérea", "Reanimación y vía aérea")
            }
            if num == 304 { return ("Urgencias específicas", "Urgencias traumatológicas") }
            if num == 305 { return ("Urgencias específicas", "Urgencias digestivas") }
            if num == 306 { return ("Urgencias específicas", "Urgencias neurológicas") }
            if num == 307 { return ("Urgencias específicas", "Urgencias nefrourológicas") }
            if num == 308 { return ("Urgencias específicas", "Urgencias obstétricas") }
            if num == 309 { return ("Urgencias específicas", "Urgencias cardiovasculares") }
            if num == 310 { return ("Urgencias específicas", "Urgencias respiratorias") }
            if num == 311 || lowerTitle.contains("psiqu") {
                return ("Urgencias específicas", "Urgencias psiquiátricas")
            }
            if num == 312 { return ("Urgencias específicas", "Urgencias endocrino-metabólicas") }
            if num == 313 { return ("Urgencias específicas", "Urgencias por agentes físicos") }
            if num == 314 { return ("Urgencias específicas", "Urgencias pediátricas") }
            if num == 315 { return ("Urgencias específicas", "Intoxicaciones") }
            return ("Urgencias específicas", "Otras urgencias")

        case "svb":
            if id.hasPrefix("412") {
                return ("Traumatismos SVB", "Valoración del politraumatizado")
            }
            if num <= 406 {
                return ("Valoración y soporte vital", "Secuencia básica")
            }
            return ("Patologías prevalentes", "Motivos de asistencia")

        case "psicologicos":
            return ("Intervención psicológica", "Activación de guardia")

        case "tecnicas":
            if num == 601 { return ("Procedimientos básicos", "Relación y valoración") }
            if num == 602 { return ("Vía aérea y respiración", "Técnicas respiratorias") }
            if num == 603 { return ("Cardiacos", "Técnicas cardiacas") }
            if num == 604 { return ("Vasculares", "Accesos vasculares") }
            if num == 605 { return ("Sondajes", "Sondajes y lavados") }
            if num == 606 { return ("Trauma", "Técnicas traumatológicas") }
            if num == 607 || num == 608 { return ("Otras técnicas", "Exploración y otras") }
            if num == 609 { return ("Obstetricia", "Técnicas obstétricas") }
            return ("Técnicas asistenciales", "Procedimientos")

        default:
            return ("General", "Procedimientos")
        }
    }

    func matches(_ query: String) -> Bool {
        let q = query.lowercased()
        return title.lowercased().contains(q) || id.lowercased().contains(q)
    }
}
