import Foundation
import MapKit

struct Hospital: Codable, Identifiable {
    let id: String
    let code: Int?
    let name: String
    let shortName: String
    let address: String
    let district: String?
    let lat: Double
    let lng: Double
    let type: String
    let status4: Int?
    let emergency: Bool?

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }

    var typeLabel: String {
        type == "public" ? "Público" : "Privado"
    }
}
