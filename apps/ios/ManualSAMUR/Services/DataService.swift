import Foundation

private let baseURL = "https://manual-samur.vercel.app/data"

struct AppData {
    var procedures: [Procedure]
    var drugs: [Drug]
    var codes: [String: [Code]]
    var hospitals: [Hospital]
    var bases: [Base]
    var status4: [Status4Entry]
    var perfusiones: [Perfusion]
    var fluidos: [Fluid]
    var comerciales: [CommercialDrug]
}

struct DataService {

    // MARK: - Network

    static func fetchManifest() async throws -> Manifest {
        let url = URL(string: "\(baseURL)/manifest.json")!
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode(Manifest.self, from: data)
    }

    static func fetchAll() async throws -> AppData {
        async let proceduresData  = fetch(path: "procedures.json")
        async let vademecumData   = fetch(path: "vademecum.json")
        async let codigosData     = fetch(path: "codigos.json")
        async let hospitalsData   = fetch(path: "hospitals.json")
        async let perfusionesData = fetch(path: "perfusiones.json")
        async let fluidosData     = fetch(path: "fluidos.json")
        async let comercialesData = fetch(path: "vademecum-comerciales.json")

        let (pd, vd, cd, hd, pfd, fld, comd) = try await (
            proceduresData, vademecumData, codigosData, hospitalsData,
            perfusionesData, fluidosData, comercialesData
        )

        let procedures  = try JSONDecoder().decode([Procedure].self, from: pd)
        let drugs       = try JSONDecoder().decode([Drug].self, from: vd)
        let codesMap    = try parseCodigos(data: cd)
        let hospitals   = try JSONDecoder().decode([Hospital].self, from: hd)
        let perfusiones = try JSONDecoder().decode([Perfusion].self, from: pfd)
        let fluidos     = try JSONDecoder().decode([Fluid].self, from: fld)
        let comerciales = try JSONDecoder().decode([CommercialDrug].self, from: comd)

        // Stable reference data — always load from bundle
        let bases: [Base] = (try? loadBundledFile(name: "bases")) ?? []
        let status4: [Status4Entry] = (try? loadBundledFile(name: "status4")) ?? []

        return AppData(
            procedures: procedures, drugs: drugs, codes: codesMap, hospitals: hospitals,
            bases: bases, status4: status4,
            perfusiones: perfusiones, fluidos: fluidos, comerciales: comerciales
        )
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
        let procedures:  [Procedure]     = try loadBundledFile(name: "procedures")
        let drugs:       [Drug]          = try loadBundledFile(name: "vademecum")
        let hospitals:   [Hospital]      = try loadBundledFile(name: "hospitals")
        let bases:       [Base]          = (try? loadBundledFile(name: "bases")) ?? []
        let status4:     [Status4Entry]  = (try? loadBundledFile(name: "status4")) ?? []
        let perfusiones: [Perfusion]     = (try? loadBundledFile(name: "perfusiones")) ?? []
        let fluidos:     [Fluid]         = (try? loadBundledFile(name: "fluidos")) ?? []
        let comerciales: [CommercialDrug] = (try? loadBundledFile(name: "vademecum-comerciales")) ?? []

        let codigosData = try bundledData(name: "codigos")
        let codesMap    = try parseCodigos(data: codigosData)

        return AppData(
            procedures: procedures, drugs: drugs, codes: codesMap, hospitals: hospitals,
            bases: bases, status4: status4,
            perfusiones: perfusiones, fluidos: fluidos, comerciales: comerciales
        )
    }

    static func loadBundledCheatsheet() throws -> [CheatsheetSection] {
        try loadBundledFile(name: "codigos-cheatsheet")
    }

    static func loadBundledPDFClassification() throws -> PDFClassification {
        try loadBundledFile(name: "pdf-classification")
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
            codesForStorage[type] = codes.map { StorableCode(code: $0.code, name: $0.name, category: $0.category, description: $0.description, noReport: $0.noReport, tetra: $0.tetra) }
        }
        try JSONEncoder().encode(codesForStorage)
            .write(to: dir.appendingPathComponent("codigos.json"))

        try JSONEncoder().encode(data.hospitals)
            .write(to: dir.appendingPathComponent("hospitals.json"))
        try JSONEncoder().encode(data.perfusiones)
            .write(to: dir.appendingPathComponent("perfusiones.json"))
        try JSONEncoder().encode(data.fluidos)
            .write(to: dir.appendingPathComponent("fluidos.json"))
        try JSONEncoder().encode(data.comerciales)
            .write(to: dir.appendingPathComponent("comerciales.json"))
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

        // New cached files — fall back to bundled if cache entry is missing
        // (e.g. first launch after app update that added these files)
        let perfusiones: [Perfusion] = (try? JSONDecoder().decode(
            [Perfusion].self,
            from: try Data(contentsOf: dir.appendingPathComponent("perfusiones.json"))
        )) ?? (try? loadBundledFile(name: "perfusiones")) ?? []

        let fluidos: [Fluid] = (try? JSONDecoder().decode(
            [Fluid].self,
            from: try Data(contentsOf: dir.appendingPathComponent("fluidos.json"))
        )) ?? (try? loadBundledFile(name: "fluidos")) ?? []

        let comerciales: [CommercialDrug] = (try? JSONDecoder().decode(
            [CommercialDrug].self,
            from: try Data(contentsOf: dir.appendingPathComponent("comerciales.json"))
        )) ?? (try? loadBundledFile(name: "vademecum-comerciales")) ?? []

        var codesMap: [String: [Code]] = [:]
        for (type, items) in codesRaw {
            codesMap[type] = items.map { Code(type: type, code: $0.code, name: $0.name, category: $0.category, description: $0.description, noReport: $0.noReport, tetra: $0.tetra) }
        }

        let bases: [Base] = (try? loadBundledFile(name: "bases")) ?? []
        let status4: [Status4Entry] = (try? loadBundledFile(name: "status4")) ?? []

        return AppData(
            procedures: procedures, drugs: drugs, codes: codesMap, hospitals: hospitals,
            bases: bases, status4: status4,
            perfusiones: perfusiones, fluidos: fluidos, comerciales: comerciales
        )
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
    let noReport: Bool?
    let tetra: Bool?
}
