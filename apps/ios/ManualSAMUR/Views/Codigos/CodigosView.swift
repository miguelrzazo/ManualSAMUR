import SwiftUI

// MARK: - CodigosView

struct CodigosView: View {
    @Environment(DataStore.self) private var store
    @State private var selectedType = "incidente"
    @State private var selectedCode: Code?
    @State private var showSearch = false
    @State private var showMenu = false
    @State private var showScrollToTop = false
    @State private var selectedCheatsheetKey = "plantillas"

    // Types that always appear regardless of code data
    private let specialTypes: Set<String> = ["hospitales", "bases", "comunicaciones"]

    private var availableTypes: [String] {
        codigoTypeOrder.filter { type in
            if specialTypes.contains(type) { return true }
            return !(store.codes(for: type).isEmpty)
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            typePicker
            Divider()
            mainContent
        }
        .navigationTitle("Códigos")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSearch = true } label: {
                    Image(systemName: "magnifyingglass")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showMenu = true } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(item: $selectedCode) { code in
            CodeDetailView(code: code)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showSearch) {
            GlobalSearchView()
        }
        .sheet(isPresented: $showMenu) {
            AppMenuSheet()
                .presentationDetents([.large])
        }
    }

    // MARK: - Type picker

    private var typePicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(availableTypes, id: \.self) { type in
                    Button {
                        selectedType = type
                        showScrollToTop = false
                    } label: {
                        Text(codigoTypeLabels[type] ?? type)
                            .font(.subheadline.weight(selectedType == type ? .semibold : .regular))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(
                                selectedType == type ? Color.samurBlue : Color.secondary.opacity(0.12),
                                in: Capsule()
                            )
                            .foregroundStyle(selectedType == type ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
    }

    // MARK: - Sorted data

    private var sortedHospitals: [Hospital] {
        store.hospitals.sorted { $0.name < $1.name }
    }

    private var sortedBases: [Base] {
        store.bases.sorted { $0.number < $1.number }
    }

    // MARK: - Main content

    @ViewBuilder
    private var mainContent: some View {
        switch selectedType {
        case "hospitales":
            HospitalesTab(hospitals: sortedHospitals)
                .onAppear { showScrollToTop = false }
        case "bases":
            BasesTab(bases: sortedBases)
                .onAppear { showScrollToTop = false }
        case "comunicaciones":
            ComunicacionesTab(
                sections: store.cheatsheetSections,
                selectedKey: $selectedCheatsheetKey
            )
            .onAppear { showScrollToTop = false }
        default:
            CodesTab(
                selectedType: selectedType,
                codes: store.codes(for: selectedType),
                showScrollToTop: $showScrollToTop,
                onSelect: { selectedCode = $0 }
            )
        }
    }
}

// MARK: - Hospitales tab

private struct HospitalesTab: View {
    let hospitals: [Hospital]

    var body: some View {
        List(hospitals) { hospital in
            HospitalRow(hospital: hospital)
        }
        .listStyle(.plain)
    }
}

private struct HospitalRow: View {
    let hospital: Hospital

    private var typeColor: Color {
        hospital.type == "public" ? Color.samurBlue : Color(hex: "#5E5CE6")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 8) {
                Text(hospital.typeLabel)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(typeColor)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(typeColor.opacity(0.12), in: Capsule())
                Text(hospital.name)
                    .font(.body)
                    .lineLimit(2)
            }
            HStack(spacing: 4) {
                if let district = hospital.district, !district.isEmpty {
                    Text(district)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Text("·")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
                Text(hospital.address)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Bases tab

private struct BasesTab: View {
    let bases: [Base]

    var body: some View {
        List(bases) { base in
            BaseRow(base: base)
        }
        .listStyle(.plain)
    }
}

private struct BaseRow: View {
    let base: Base

    var body: some View {
        HStack(spacing: 12) {
            Text("B\(base.number)")
                .font(.system(.callout, design: .monospaced, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.samurBlue, in: RoundedRectangle(cornerRadius: 6))
                .fixedSize()

            VStack(alignment: .leading, spacing: 2) {
                Text(base.name)
                    .font(.body)
                    .lineLimit(2)
                Text("\(base.district) · \(base.address)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Comunicaciones tab

private let comunicacionesKeys = ["plantillas", "grupos", "tetra", "estatus"]

private struct ComunicacionesTab: View {
    let sections: [CheatsheetSection]
    @Binding var selectedKey: String

    private var filteredSections: [CheatsheetSection] {
        comunicacionesKeys.compactMap { key in
            sections.first { $0.key == key }
        }
    }

    private var currentSection: CheatsheetSection? {
        filteredSections.first { $0.key == selectedKey }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Section picker
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(filteredSections) { section in
                        Button {
                            selectedKey = section.key
                        } label: {
                            Text(section.title)
                                .font(.subheadline.weight(selectedKey == section.key ? .semibold : .regular))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .background(
                                    selectedKey == section.key ? Color.samurBlue : Color.secondary.opacity(0.12),
                                    in: Capsule()
                                )
                                .foregroundStyle(selectedKey == section.key ? .white : .primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
            }
            Divider()

            if let section = currentSection {
                CheatsheetSectionView(section: section)
            } else {
                ContentUnavailableView("Sin contenido", systemImage: "antenna.radiowaves.left.and.right")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

private struct CheatsheetSectionView: View {
    let section: CheatsheetSection

    var body: some View {
        switch section.kind {
        case .cards:
            ScrollView {
                VStack(spacing: 12) {
                    ForEach(Array(section.items.enumerated()), id: \.offset) { _, item in
                        CheatsheetCardItem(item: item)
                    }
                }
                .padding()
            }
        case .table:
            CheatsheetTableView(section: section)
        }
    }
}

private struct CheatsheetCardItem: View {
    let item: CheatsheetItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let title = item.title, !title.isEmpty {
                Text(title)
                    .font(.headline)
            }
            ForEach(item.lines ?? [], id: \.self) { line in
                HStack(alignment: .top, spacing: 6) {
                    Text("•")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Text(line)
                        .font(.subheadline)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
    }
}

private struct CheatsheetTableView: View {
    let section: CheatsheetSection

    private var columns: [String] { section.columns ?? [] }

    var body: some View {
        List {
            ForEach(Array(section.items.enumerated()), id: \.offset) { _, item in
                CheatsheetTableRow(item: item, columns: columns)
            }
        }
        .listStyle(.plain)
    }
}

private struct CheatsheetTableRow: View {
    let item: CheatsheetItem
    let columns: [String]

    var body: some View {
        if columns.count == 2 {
            // Two-column: "label: value" layout
            HStack(alignment: .top, spacing: 8) {
                Text(item.value(for: columns[0]) ?? "")
                    .font(.body.weight(.semibold))
                    .frame(minWidth: 60, alignment: .leading)
                Text(item.value(for: columns[1]) ?? "")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 2)
        } else if columns.count >= 3 {
            // Three+ columns: first column as leading label, rest below
            VStack(alignment: .leading, spacing: 3) {
                Text(item.value(for: columns[0]) ?? "")
                    .font(.body.weight(.semibold))
                HStack(spacing: 12) {
                    ForEach(columns.dropFirst(), id: \.self) { col in
                        if let val = item.value(for: col), !val.isEmpty {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(col)
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                                Text(val)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 2)
        } else {
            // Fallback: show title
            Text(item.title ?? "")
                .font(.body)
        }
    }
}

// MARK: - Codes tab (grouped by category)

private struct CodesTab: View {
    let selectedType: String
    let codes: [Code]
    @Binding var showScrollToTop: Bool
    let onSelect: (Code) -> Void

    private var groupedCodes: [(category: String, codes: [Code])] {
        var grouped: [String: [Code]] = [:]
        var orderedKeys: [String] = []
        var seen = Set<String>()
        for code in codes {
            let key = code.category ?? "General"
            if seen.insert(key).inserted { orderedKeys.append(key) }
            grouped[key, default: []].append(code)
        }
        return orderedKeys.map { key in (category: key, codes: grouped[key]!) }
    }

    private var showNoReportLegend: Bool {
        (selectedType == "sva" || selectedType == "svb") && codes.contains { $0.noReport == true }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                    // Top anchor for back-to-top detection
                    Color.clear
                        .frame(height: 1)
                        .id("top")
                        .onAppear { showScrollToTop = false }
                        .onDisappear { showScrollToTop = true }

                    // Grouped sections
                    ForEach(groupedCodes, id: \.category) { group in
                        Section {
                            ForEach(group.codes) { code in
                                VStack(spacing: 0) {
                                    CodeRow(code: code)
                                        .contentShape(Rectangle())
                                        .onTapGesture { onSelect(code) }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 6)
                                    Divider().padding(.leading, 16)
                                }
                            }
                        } header: {
                            Text(group.category)
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 6)
                                .background(.background)
                        }
                    }

                    // noReport legend
                    if showNoReportLegend {
                        Text("Los códigos marcados con ⊘ no generan informe asistencial")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                    }
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if showScrollToTop {
                    Button {
                        withAnimation { proxy.scrollTo("top", anchor: .top) }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white, Color.samurBlue)
                            .padding(8)
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 16)
                    .transition(.opacity.combined(with: .scale))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: showScrollToTop)
        }
    }
}

// MARK: - CodeRow

private struct CodeRow: View {
    let code: Code

    var body: some View {
        HStack(spacing: 10) {
            // Prominent code badge
            Text(code.code)
                .font(.system(.callout, design: .monospaced, weight: .bold))
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.samurBlue, in: RoundedRectangle(cornerRadius: 6))
                .fixedSize()

            // Name
            Text(code.name)
                .font(.body)
                .lineLimit(2)

            Spacer(minLength: 4)

            // Icons
            HStack(spacing: 4) {
                if code.tetra == true {
                    Image(systemName: "antenna.radiowaves.left.and.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if code.noReport == true {
                    Image(systemName: "doc.badge.minus")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}
