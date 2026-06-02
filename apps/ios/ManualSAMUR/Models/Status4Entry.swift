import Foundation

struct Status4Entry: Codable, Identifiable {
    let status: Int
    let hospitalId: String?
    let hospitalName: String?
    let description: String

    var id: Int { status }
}
