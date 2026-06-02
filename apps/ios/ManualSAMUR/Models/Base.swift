import Foundation
import MapKit

struct Base: Codable, Identifiable {
    let id: String
    let number: Int
    let name: String
    let district: String
    let address: String
    let lat: Double
    let lng: Double

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: lat, longitude: lng)
    }
}
