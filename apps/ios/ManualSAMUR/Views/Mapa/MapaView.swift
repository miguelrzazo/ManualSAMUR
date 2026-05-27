import SwiftUI
import MapKit

struct MapaView: View {
    @Environment(DataStore.self) private var store
    @State private var selectedHospital: Hospital?
    @State private var position: MapCameraPosition = .region(
        MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 40.4168, longitude: -3.7038),
            span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
        )
    )

    var body: some View {
        Map(position: $position) {
            ForEach(store.hospitals) { hospital in
                Annotation(hospital.shortName, coordinate: hospital.coordinate) {
                    HospitalPin(hospital: hospital, isSelected: selectedHospital?.id == hospital.id)
                        .onTapGesture { selectedHospital = hospital }
                }
            }
        }
        .mapStyle(.standard(elevation: .realistic))
        .navigationTitle("Mapa")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selectedHospital) { hospital in
            HospitalDetailSheet(hospital: hospital)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    withAnimation {
                        position = .region(
                            MKCoordinateRegion(
                                center: CLLocationCoordinate2D(latitude: 40.4168, longitude: -3.7038),
                                span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
                            )
                        )
                    }
                } label: {
                    Image(systemName: "location.fill")
                }
            }
        }
    }
}

// MARK: - Hospital pin

private struct HospitalPin: View {
    let hospital: Hospital
    let isSelected: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(isSelected ? Color.samurBlue : Color.samurBlue.opacity(0.8))
                .frame(width: isSelected ? 36 : 28, height: isSelected ? 36 : 28)
                .shadow(color: Color.samurBlue.opacity(0.4), radius: isSelected ? 6 : 2)

            Image(systemName: hospital.emergency == true ? "cross.fill" : "building.2.fill")
                .font(.system(size: isSelected ? 16 : 12, weight: .semibold))
                .foregroundStyle(.white)
        }
        .animation(.spring(duration: 0.2), value: isSelected)
    }
}

// MARK: - Hospital detail sheet

private struct HospitalDetailSheet: View {
    let hospital: Hospital
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(hospital.name)
                            .font(.headline)
                        HStack(spacing: 8) {
                            SectionBadge(label: hospital.typeLabel, color: Color.samurBlue)
                            if hospital.emergency == true {
                                SectionBadge(label: "Urgencias", color: .red)
                            }
                        }
                    }
                    .padding(.vertical, 4)
                }

                Section("Dirección") {
                    Label(hospital.address, systemImage: "mappin")
                    if let district = hospital.district {
                        Label(district, systemImage: "building.2")
                    }
                }

                Section {
                    Button {
                        let item = MKMapItem(placemark: MKPlacemark(coordinate: hospital.coordinate))
                        item.name = hospital.name
                        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
                    } label: {
                        Label("Cómo llegar", systemImage: "arrow.triangle.turn.up.right.circle.fill")
                    }
                }
            }
            .navigationTitle(hospital.shortName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
