import Foundation

struct Code: Identifiable {
    let type: String
    let code: String
    let name: String
    let category: String?
    let description: String?
    let noReport: Bool?
    let tetra: Bool?

    var id: String { "\(type)-\(code)" }

    func matches(_ query: String) -> Bool {
        let q = query.lowercased()
        if code.lowercased().contains(q) { return true }
        if name.lowercased().contains(q) { return true }
        if let category, category.lowercased().contains(q) { return true }
        return false
    }
}

// JSON shapes vary per type; this intermediate struct normalises them.
struct RawCode: Decodable {
    let code: String
    let name: String
    let category: String?
    let description: String?
    let group: String?   // indicativos uses "group" instead of "category"
    let noReport: Bool?
    let tetra: Bool?

    func toCode(type: String) -> Code {
        Code(
            type: type,
            code: code,
            name: name,
            category: category ?? group,
            description: description,
            noReport: noReport,
            tetra: tetra
        )
    }
}

let codigoTypeOrder: [String] = [
    "incidente", "sva", "svb", "upsi", "upsq",
    "indicativos", "claves", "lima", "icao",
    "hospitales", "bases", "comunicaciones"
]

let codigoTypeLabels: [String: String] = [
    "incidente": "Incidente",
    "sva": "SVA",
    "svb": "SVB",
    "upsi": "UPSI",
    "upsq": "UPSQ",
    "indicativos": "Indicativos",
    "claves": "Claves",
    "lima": "Lima",
    "icao": "ICAO",
    "hospitales": "Hospitales",
    "bases": "Bases",
    "comunicaciones": "Comunicaciones",
]
