import Foundation

private let baseURL = "https://manual-samur.vercel.app/data"

struct AppData {
    var procedures: [Procedure]
    var drugs: [Drug]
    var codes: [String: [Code]]
    var hospitals: [Hospital]
}

struct DataService {

    // MARK: - Network

    static func fetchManifest() async throws -> Manifest {
        let url = URL(string: "\(baseURL)/manifest.json")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode(Manifest.self, from: data)
    }

    static func fetchAll() async throws -> AppData {
        async let proceduresData = fetch(path: "procedures.json")
        async let vademecumData  = fetch(path: "vademecum.json")
        async let codigosData    = fetch(path: "codigos.json")
        async let hospitalsData  = fetch(path: "hospitals.json")

        let (pd, vd, cd, hd) = try await (proceduresData, vademecumData, codigosData, hospitalsData)

        let procedures = try JSONDecoder().decode([Procedure].self, from: pd)
        let drugs      = try JSONDecoder().decode([Drug].self, from: vd)
        let codesMap   = try parseCodigos(data: cd)
        let hospitals  = try JSONDecoder().decode([Hospital].self, from: hd)

        return AppData(procedures: procedures, drugs: drugs, codes: codesMap, hospitals: hospitals)
    }

    private static func fetch(path: String) async throws -> Data {
        let url = URL(string: "\(baseURL)/\(path)")!
        let (data, response) = try await URLSession.shared.data(from: url)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        return data
    }

    private static func parseCodigos(data: Data) throws -> [String: [Code]] {
        let raw = try JSONDecoder().decode([String: [RawCode]].self, from: data)
        var result: [String: [Code]] = [:]
        for (type, items) in raw {
            result[type] = items.map { $0.toCode(type: type) }
        }
        return result
    }

    // MARK: - Bundle (initial data shipped with the app)

    static func loadBundled() throws -> AppData {
        let procedures: [Procedure] = try loadBundledFile(name: "procedures")
        let drugs:      [Drug]      = try loadBundledFile(name: "vademecum")
        let hospitals:  [Hospital]  = try loadBundledFile(name: "hospitals")

        let codigosData = try bundledData(name: "codigos")
        let codesMap    = try parseCodigos(data: codigosData)

        return AppData(procedures: procedures, drugs: drugs, codes: codesMap, hospitals: hospitals)
    }

    private static func loadBundledFile<T: Decodable>(name: String) throws -> T {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try JSONDecoder().decode(T.self, from: try Data(contentsOf: url))
    }

    private static func bundledData(name: String) throws -> Data {
        guard let url = Bundle.main.url(forResource: name, withExtension: "json") else {
            throw CocoaError(.fileNoSuchFile)
        }
        return try Data(contentsOf: url)
    }

    static var hasBundledData: Bool {
        Bundle.main.url(forResource: "procedures", withExtension: "json") != nil
    }

    // MARK: - Cache

    private static var cacheDir: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ios_cache", isDirectory: true)
    }

    static func saveCache(_ data: AppData) throws {
        let dir = cacheDir
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        try JSONEncoder().encode(data.procedures)
            .write(to: dir.appendingPathComponent("procedures.json"))
        try JSONEncoder().encode(data.drugs)
            .write(to: dir.appendingPathComponent("vademecum.json"))

        var codesForStorage: [String: [StorableCode]] = [:]
        for (type, codes) in data.codes {
            codesForStorage[type] = codes.map { StorableCode(code: $0.code, name: $0.name, category: $0.category, description: $0.description) }
        }
        try JSONEncoder().encode(codesForStorage)
            .write(to: dir.appendingPathComponent("codigos.json"))

        try JSONEncoder().encode(data.hospitals)
            .write(to: dir.appendingPathComponent("hospitals.json"))
    }

    static func loadCached() throws -> AppData {
        let dir = cacheDir

        let procedures = try JSONDecoder().decode(
            [Procedure].self,
            from: try Data(contentsOf: dir.appendingPathComponent("procedures.json"))
        )
        let drugs = try JSONDecoder().decode(
            [Drug].self,
            from: try Data(contentsOf: dir.appendingPathComponent("vademecum.json"))
        )
        let codesRaw = try JSONDecoder().decode(
            [String: [StorableCode]].self,
            from: try Data(contentsOf: dir.appendingPathComponent("codigos.json"))
        )
        let hospitals = try JSONDecoder().decode(
            [Hospital].self,
            from: try Data(contentsOf: dir.appendingPathComponent("hospitals.json"))
        )

        var codesMap: [String: [Code]] = [:]
        for (type, items) in codesRaw {
            codesMap[type] = items.map { Code(type: type, code: $0.code, name: $0.name, category: $0.category, description: $0.description) }
        }

        return AppData(procedures: procedures, drugs: drugs, codes: codesMap, hospitals: hospitals)
    }

    static var hasCachedData: Bool {
        FileManager.default.fileExists(
            atPath: cacheDir.appendingPathComponent("procedures.json").path
        )
    }
}

private struct StorableCode: Codable {
    let code: String
    let name: String
    let category: String?
    let description: String?
}
