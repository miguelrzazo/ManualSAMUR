import Foundation

// MARK: - Wire format (public mobile snapshot, schema "samur-manual.mobile-content" v3)

/// The public mobile snapshot served by `/api/mobile/content/v3` (and by the immutable
/// `/api/public/releases/<id>/snapshot`). The Watch only decodes the four content keys it
/// shows; every other key in `content` (procedures, hospitals, ...) is ignored, so the
/// iPhone may send either the full envelope or one trimmed to these keys.
struct ContentEnvelope: Decodable {
    static let expectedSchema = "samur-manual.mobile-content"

    let schema: String
    let version: Int
    let generatedAt: String
    let hash: String
    let content: Payload

    struct Payload: Decodable {
        let codes: [String: CodeDatasetPayload]
        let drugs: [Drug]
        let commercialNames: [CommercialName]?
        let status4: [Status4Entry]
    }
}

/// `content.codes.<key>` is a flat list of codes for every dataset except `cheatsheet`,
/// which is a list of card/table sections.
enum CodeDatasetPayload: Decodable {
    case codes([CodeEntry])
    case cheatsheet([CheatsheetSection])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let codes = try? container.decode([CodeEntry].self) {
            self = .codes(codes)
        } else {
            self = .cheatsheet(try container.decode([CheatsheetSection].self))
        }
    }
}

// MARK: - Domain

struct CodeEntry: Codable, Hashable, Sendable {
    let code: String
    let name: String
    let category: String?
    let group: String?
    let description: String?
    let tetra: Bool?
    let noReport: Bool?

    /// `description` is often a verbatim copy of `name`; only show it when it adds something.
    var extraDescription: String? {
        guard let description, !description.isEmpty, description != name else { return nil }
        return description
    }
}

struct CheatsheetSection: Codable, Hashable, Sendable {
    let key: String
    let title: String
    let kind: String
    let columns: [String]?
    let items: [[String: CheatsheetCell]]

    /// Flattens a section into title/detail rows that fit a watch list.
    var rows: [CheatsheetRow] {
        items.enumerated().map { index, item in
            if kind == "table", let columns, let first = columns.first {
                let title = item[first]?.text ?? ""
                let detail = columns.dropFirst()
                    .compactMap { column -> String? in
                        guard let value = item[column]?.text, !value.isEmpty else { return nil }
                        return "\(column): \(value)"
                    }
                    .joined(separator: "\n")
                return CheatsheetRow(id: index, title: title, detail: detail)
            }
            let title = item["title"]?.text ?? ""
            let detail = item["lines"]?.text ?? item.filter { $0.key != "title" }.values.map(\.text).joined(separator: "\n")
            return CheatsheetRow(id: index, title: title, detail: detail)
        }
    }
}

struct CheatsheetRow: Identifiable, Hashable {
    let id: Int
    let title: String
    let detail: String
}

enum CheatsheetCell: Codable, Hashable, Sendable {
    case string(String)
    case lines([String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .string(value)
        } else {
            self = .lines(try container.decode([String].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .lines(let value): try container.encode(value)
        }
    }

    var text: String {
        switch self {
        case .string(let value): value
        case .lines(let value): value.joined(separator: "\n")
        }
    }
}

struct Drug: Codable, Hashable, Identifiable, Sendable {
    let id: String
    let name: String
    let category: String?
    let subcategory: String?
    let synonyms: [String]?
    let presentation: String?
    let funcion: String?
    let indication: String?
    let dose: String?
    let route: [String]?
    let contraindications: String?
    let precauciones: String?
    let efectos_secundarios: String?
    let interacciones: String?
    let incompatibilidades: String?
    let notes: String?
}

struct CommercialName: Codable, Hashable, Sendable {
    let drugId: String
    let activeIngredient: String?
    let presentation: String?
    let brandNames: [String]
}

struct Status4Entry: Codable, Hashable, Identifiable, Sendable {
    let status: Int
    let hospitalId: String?
    let hospitalName: String?
    let description: String?

    var id: Int { status }

    /// Status 4 + 4 has no destination hospital ("no operativo").
    var title: String { hospitalName ?? "Sin hospital" }

    /// The part of the description after the arrow, e.g. "No operativo, solo se pasa clave cuatro".
    var meaning: String? {
        guard let description else { return nil }
        if let range = description.range(of: "→") {
            return description[range.upperBound...].trimmingCharacters(in: .whitespaces)
        }
        return description
    }
}

// MARK: - Persisted Watch copy

enum ContentOrigin: String, Codable, Sendable {
    case seed, network, phone

    var label: String {
        switch self {
        case .seed: "copia incluida en la app"
        case .network: "servidor"
        case .phone: "iPhone"
        }
    }
}

struct CodeGroup: Codable, Hashable, Identifiable, Sendable {
    let key: String
    let title: String
    let entries: [CodeEntry]

    var id: String { key }
}

/// The compact copy the Watch keeps on disk and renders from. It is rebuilt from a
/// `ContentEnvelope`, never edited in place.
struct WatchContent: Codable, Sendable {
    static let formatVersion = 1

    var formatVersion: Int = WatchContent.formatVersion
    let hash: String
    let generatedAt: String
    let origin: ContentOrigin
    let receivedAt: Date
    let codeGroups: [CodeGroup]
    let cheatsheet: [CheatsheetSection]
    let drugs: [Drug]
    let commercialNames: [CommercialName]
    let status4: [Status4Entry]

    /// Display order and Spanish titles for the code datasets. Unknown keys from a newer
    /// backend are kept and appended after these, titled with their uppercased key.
    static let codeGroupOrder: [(key: String, title: String)] = [
        ("claves", "Claves"),
        ("incidente", "Incidente"),
        ("indicativos", "Indicativos"),
        ("sva", "Patología SVA"),
        ("svb", "Patología SVB"),
        ("upsi", "UPSI"),
        ("upsq", "UPSQ"),
        ("lima", "Lima"),
        ("icao", "ICAO"),
        ("pc", "PC"),
    ]

    init(envelope: ContentEnvelope, origin: ContentOrigin, receivedAt: Date = .now) throws {
        guard envelope.schema == ContentEnvelope.expectedSchema else {
            throw ContentError.unexpectedSchema(envelope.schema)
        }
        guard !envelope.content.drugs.isEmpty, !envelope.content.status4.isEmpty, !envelope.content.codes.isEmpty else {
            throw ContentError.incomplete
        }
        hash = envelope.hash
        generatedAt = envelope.generatedAt
        self.origin = origin
        self.receivedAt = receivedAt

        var groups: [CodeGroup] = []
        var cheatsheet: [CheatsheetSection] = []
        let known = Set(Self.codeGroupOrder.map(\.key))
        let extraKeys = envelope.content.codes.keys.filter { !known.contains($0) }.sorted()
        let ordered = Self.codeGroupOrder + extraKeys.map { ($0, $0.uppercased()) }
        for (key, title) in ordered {
            switch envelope.content.codes[key] {
            case .codes(let entries)? where !entries.isEmpty:
                groups.append(CodeGroup(key: key, title: title, entries: entries))
            case .cheatsheet(let sections)?:
                cheatsheet.append(contentsOf: sections)
            default:
                break
            }
        }
        codeGroups = groups
        self.cheatsheet = cheatsheet
        drugs = envelope.content.drugs.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        commercialNames = envelope.content.commercialNames ?? []
        status4 = envelope.content.status4.sorted { $0.status < $1.status }
    }

    /// Calendar date of the publication, e.g. "28 oct 2026".
    var publishedDateText: String {
        guard let date = Self.parseDate(generatedAt) else { return generatedAt }
        return date.formatted(.dateTime.day().month(.abbreviated).year().locale(Locale(identifier: "es_ES")))
    }

    var publishedDate: Date? { Self.parseDate(generatedAt) }

    static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

enum ContentError: LocalizedError {
    case unexpectedSchema(String)
    case incomplete
    case hashMismatch
    case badStatus(Int)

    var errorDescription: String? {
        switch self {
        case .unexpectedSchema(let schema): "Formato de datos no reconocido (\(schema))."
        case .incomplete: "Los datos recibidos están incompletos."
        case .hashMismatch: "Los datos recibidos no coinciden con la publicación activa."
        case .badStatus(let code): "El servidor respondió \(code)."
        }
    }
}
