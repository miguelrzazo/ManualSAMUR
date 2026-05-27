import Foundation

enum CheatsheetKind: String, Codable {
    case cards, table
}

struct CheatsheetSection: Codable, Identifiable {
    let key: String
    let title: String
    let kind: CheatsheetKind
    let columns: [String]?
    let items: [CheatsheetItem]
    var id: String { key }
}

struct CheatsheetItem: Codable {
    let title: String?
    let lines: [String]?
    private let tableValues: [String: String]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: AnyCodingKey.self)

        // Decode known typed keys
        title = try container.decodeIfPresent(String.self, forKey: AnyCodingKey("title"))
        lines = try container.decodeIfPresent([String].self, forKey: AnyCodingKey("lines"))

        // Capture all remaining string-valued keys as table values
        var values: [String: String] = [:]
        let skip = Set(["title", "lines"])
        for key in container.allKeys where !skip.contains(key.stringValue) {
            if let value = try? container.decode(String.self, forKey: key) {
                values[key.stringValue] = value
            }
        }
        tableValues = values
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: AnyCodingKey.self)
        try container.encodeIfPresent(title, forKey: AnyCodingKey("title"))
        try container.encodeIfPresent(lines, forKey: AnyCodingKey("lines"))
        for (key, value) in tableValues {
            try container.encode(value, forKey: AnyCodingKey(key))
        }
    }

    func value(for column: String) -> String? { tableValues[column] }
}

private struct AnyCodingKey: CodingKey {
    let stringValue: String
    var intValue: Int? { nil }
    init(_ string: String) { self.stringValue = string }
    init?(stringValue: String) { self.stringValue = stringValue }
    init?(intValue: Int) { return nil }
}
