import SwiftUI
import MapKit
import CoreLocation

// MARK: - Location Manager

@Observable
@MainActor
final class LocationManager: NSObject {
    var lastLocation: CLLocation?

    private let manager = CLLocationManager()

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyNearestTenMeters
    }

    func requestLocation() {
        manager.requestWhenInUseAuthorization()
        manager.requestLocation()
    }
}

extension LocationManager: @preconcurrency CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        lastLocation = locations.last
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}

// MARK: - Constants

private let madridCenter = CLLocationCoordinate2D(latitude: 40.4168, longitude: -3.7038)
private let initialRegion = MKCoordinateRegion(
    center: madridCenter,
    span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)
)
@MainActor private let madridBounds = MapCameraBounds(
    centerCoordinateBounds: MKCoordinateRegion(
        center: CLLocationCoordinate2D(latitude: 40.43, longitude: -3.70),
        span: MKCoordinateSpan(latitudeDelta: 0.24, longitudeDelta: 0.32)
    ),
    minimumDistance: 300,
    maximumDistance: 60_000
)

// MARK: - MapaView

struct MapaView: View {
    @Environment(DataStore.self) private var store
    @State private var selectedHospital: Hospital?
    @State private var selectedBase: Base?
    @State private var showStatus4Sheet = false
    @State private var showPublic = true
    @State private var showPrivate = true
    @State private var showBases = true
    @State private var locationManager = LocationManager()
    @State private var position: MapCameraPosition = .region(initialRegion)
    @State private var showSearch = false
    @State private var showMenu = false

    private var visibleHospitals: [Hospital] {
        store.hospitals.filter { $0.type == "public" ? showPublic : showPrivate }
    }

    private var visibleBases: [Base] {
        showBases ? store.bases : []
    }

    var body: some View {
        Map(position: $position, bounds: madridBounds) {
            ForEach(visibleHospitals) { hospital in
                Annotation(hospital.shortName, coordinate: hospital.coordinate, anchor: .center) {
                    HospitalPin(hospital: hospital, isSelected: selectedHospital?.id == hospital.id)
                        .onTapGesture {
                            selectedBase = nil
                            selectedHospital = hospital
                        }
                }
            }
            ForEach(visibleBases) { base in
                Annotation(base.name, coordinate: base.coordinate, anchor: .center) {
                    BasePin(base: base, isSelected: selectedBase?.id == base.id)
                        .onTapGesture {
                            selectedHospital = nil
                            selectedBase = base
                        }
                }
            }
            UserAnnotation()
        }
        .mapStyle(.standard(elevation: .realistic))
        .safeAreaInset(edge: .top) { filterBar }
        .navigationTitle("Mapa")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button { findNearestHospital() } label: {
                    Image(systemName: "location.circle.fill")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showMenu = true } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSearch = true } label: {
                    Image(systemName: "magnifyingglass")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showStatus4Sheet = true } label: {
                    Image(systemName: "4.square.fill")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    withAnimation { position = .region(initialRegion) }
                } label: {
                    Image(systemName: "map.fill")
                }
            }
        }
        .sheet(item: $selectedHospital) { hospital in
            HospitalDetailSheet(hospital: hospital)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(item: $selectedBase) { base in
            BaseDetailSheet(base: base)
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
        }
        .sheet(isPresented: $showStatus4Sheet) {
            Status4CheatsheetView(status4: store.status4, hospitals: store.hospitals) { hospital in
                showStatus4Sheet = false
                selectedHospital = hospital
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .onChange(of: locationManager.lastLocation) { _, _ in
            findNearestHospital()
        }
        .sheet(isPresented: $showSearch) {
            GlobalSearchView()
        }
        .sheet(isPresented: $showMenu) {
            AppMenuSheet()
                .presentationDetents([.large])
        }
    }

    // MARK: - Filter bar

    private var filterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                FilterChip(label: "Hospitales", systemImage: "cross.circle.fill", color: .red, isOn: $showPublic)
                FilterChip(label: "Privados",   systemImage: "building.2.fill",   color: .green, isOn: $showPrivate)
                FilterChip(label: "Bases",      systemImage: "car.fill",           color: .blue,  isOn: $showBases)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .background(.thinMaterial)
    }

    // MARK: - Nearest hospital

    private func findNearestHospital() {
        guard let userLoc = locationManager.lastLocation else {
            locationManager.requestLocation()
            return
        }
        let candidates = store.hospitals.filter { $0.type == "public" }
        guard let nearest = candidates.min(by: { a, b in
            userLoc.distance(from: CLLocation(latitude: a.lat, longitude: a.lng)) <
            userLoc.distance(from: CLLocation(latitude: b.lat, longitude: b.lng))
        }) else { return }
        withAnimation {
            position = .camera(MapCamera(centerCoordinate: nearest.coordinate, distance: 1500))
        }
        selectedHospital = nearest
    }
}

// MARK: - Filter chip

private struct FilterChip: View {
    let label: String
    let systemImage: String
    let color: Color
    @Binding var isOn: Bool

    var body: some View {
        Button { isOn.toggle() } label: {
            Label(label, systemImage: systemImage)
                .font(.subheadline.weight(isOn ? .semibold : .regular))
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(isOn ? color : Color.secondary.opacity(0.15), in: Capsule())
                .foregroundStyle(isOn ? .white : .primary)
        }
        .buttonStyle(.plain)
        .animation(.easeInOut(duration: 0.15), value: isOn)
    }
}

// MARK: - Hospital pin

private struct HospitalPin: View {
    let hospital: Hospital
    let isSelected: Bool

    private var size: CGFloat { isSelected ? 36 : 28 }

    var body: some View {
        ZStack {
            if hospital.type == "public" {
                Circle()
                    .fill(.red)
                    .frame(width: size, height: size)
                    .shadow(color: .red.opacity(0.4), radius: isSelected ? 6 : 2)
                if let code = hospital.code {
                    Text("\(code)")
                        .font(.system(size: isSelected ? 14 : 11, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                }
            } else {
                RoundedRectangle(cornerRadius: 3)
                    .fill(.green)
                    .frame(width: size * 0.75, height: size * 0.75)
                    .rotationEffect(.degrees(45))
                    .shadow(color: .green.opacity(0.4), radius: isSelected ? 6 : 2)
                Text("H")
                    .font(.system(size: isSelected ? 13 : 10, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .animation(.spring(duration: 0.2), value: isSelected)
    }
}

// MARK: - Base pin

private struct BasePin: View {
    let base: Base
    let isSelected: Bool

    private var size: CGFloat { isSelected ? 32 : 26 }

    var body: some View {
        ZStack {
            Circle()
                .fill(Color.samurBlue)
                .frame(width: size, height: size)
                .shadow(color: Color.samurBlue.opacity(0.4), radius: isSelected ? 5 : 2)
            Text("\(base.number)")
                .font(.system(size: isSelected ? 13 : 10, weight: .bold, design: .monospaced))
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
                            SectionBadge(
                                label: hospital.typeLabel,
                                color: hospital.type == "public" ? .red : .green
                            )
                            if hospital.emergency == true {
                                SectionBadge(label: "Urgencias", color: .red)
                            }
                            if let s4 = hospital.status4 {
                                SectionBadge(label: "Status 4·\(s4)", color: .amber)
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

// MARK: - Base detail sheet

private struct BaseDetailSheet: View {
    let base: Base
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(base.name)
                            .font(.headline)
                        SectionBadge(label: "Base \(base.number)", color: Color.samurBlue)
                    }
                    .padding(.vertical, 4)
                }

                Section("Ubicación") {
                    Label(base.address, systemImage: "mappin")
                    Label(base.district, systemImage: "building.2")
                }

                Section {
                    Button {
                        let item = MKMapItem(placemark: MKPlacemark(coordinate: base.coordinate))
                        item.name = "Base \(base.number) – \(base.name)"
                        item.openInMaps(launchOptions: [MKLaunchOptionsDirectionsModeKey: MKLaunchOptionsDirectionsModeDefault])
                    } label: {
                        Label("Cómo llegar", systemImage: "arrow.triangle.turn.up.right.circle.fill")
                    }
                }
            }
            .navigationTitle("Base \(base.number)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}

// MARK: - Status 4 cheatsheet

private struct Status4CheatsheetView: View {
    let status4: [Status4Entry]
    let hospitals: [Hospital]
    let onSelectHospital: (Hospital) -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Tras enviar Status 4, el siguiente status determina el hospital de destino automático.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }

                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Aviso importante")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.orange)
                        Text("Cuando el traslado se realice a la Maternidad o al Hospital Infantil de alguno de estos hospitales, se informará de ello por voz y por canal 1 a continuación de enviar la clave 4 y el status que corresponda. Cuando las unidades hagan clave 4 a cualquier otro hospital que no esté en este listado, se tendrá que comunicar por voz (Canal 3).")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .listRowBackground(Color.orange.opacity(0.08))
                }

                Section("Tabla de destinos") {
                    ForEach(status4) { entry in
                        Status4Row(entry: entry, hospital: hospitals.first(where: { $0.id == entry.hospitalId })) {
                            if let h = hospitals.first(where: { $0.id == entry.hospitalId }) {
                                onSelectHospital(h)
                            }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Status 4")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}

private struct Status4Row: View {
    let entry: Status4Entry
    let hospital: Hospital?
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                HStack(spacing: 4) {
                    badge("4", color: .blue)
                    Text("+").font(.caption).foregroundStyle(.secondary)
                    badge("\(entry.status)", color: .orange)
                }
                Image(systemName: "arrow.right")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                if let hospital {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(hospital.shortName)
                            .font(.body)
                            .foregroundStyle(.primary)
                        Text(hospital.id + (hospital.district.map { " · \($0)" } ?? ""))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("No operativo")
                            .font(.body)
                            .foregroundStyle(.secondary)
                        Text("Solo pasa clave cuatro")
                            .font(.caption)
                            .foregroundStyle(.tertiary)
                    }
                }
                Spacer()
            }
        }
        .buttonStyle(.plain)
        .disabled(hospital == nil)
    }

    private func badge(_ text: String, color: Color) -> some View {
        Text(text)
            .font(.caption.monospaced().weight(.semibold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: RoundedRectangle(cornerRadius: 4))
            .foregroundStyle(color)
    }
}

// MARK: - Amber color convenience

private extension Color {
    static let amber = Color(red: 1.0, green: 0.75, blue: 0.0)
}
