import Foundation

enum PDFKind: String, Codable {
    case text, image
}

struct PDFAttachment: Codable, Identifiable {
    let path: String
    let procedureId: String
    let filename: String
    let kind: PDFKind?
    let charCount: Int?

    var id: String { path }

    var remoteURL: URL? {
        var components = URLComponents()
        components.scheme = "https"
        components.host   = "manual-samur.vercel.app"
        components.path   = "/\(path)"
        return components.url
    }
}

struct PDFClassification: Codable {
    let generatedAt: String?
    let total: Int?
    let text: Int?
    let image: Int?
    let error: Int?
    let pdfs: [PDFAttachment]
}
