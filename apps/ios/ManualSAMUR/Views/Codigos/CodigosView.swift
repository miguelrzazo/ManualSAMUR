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
            mainContent
                .samurPageBackground()
        }
        .navigationTitle("Códigos")
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
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
        UnderlineTabPicker(
            tabs: availableTypes.map { (label: codigoTypeLabels[$0] ?? $0, value: $0) },
            selection: $selectedType
        )
        .background(.ultraThinMaterial)
        .onChange(of: selectedType) { _, _ in showScrollToTop = false }
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
        hospital.type == "public" ? Color.samurPrimary : Color(hex: "#8B5CF6")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .center, spacing: 8) {
                Text(hospital.typeLabel)
                    .font(.samurCaption2.weight(.semibold))
                    .foregroundStyle(typeColor)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 2)
                    .background(typeColor.opacity(0.12), in: Capsule())
                    .overlay(Capsule().strokeBorder(typeColor.opacity(0.2), lineWidth: 0.5))
                Text(hospital.name)
                    .font(.samurBody)
                    .lineLimit(2)
            }
            HStack(spacing: 4) {
                if let district = hospital.district, !district.isEmpty {
                    Text(district)
                        .font(.samurCaption2)
                        .foregroundStyle(.secondary)
                    Text("·")
                        .font(.samurCaption2)
                        .foregroundStyle(.tertiary)
                }
                Text(hospital.address)
                    .font(.samurCaption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 3)
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
                .font(.samurMonoBody)
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color.samurPrimary, in: RoundedRectangle(cornerRadius: 7))
                .fixedSize()

            VStack(alignment: .leading, spacing: 2) {
                Text(base.name)
                    .font(.samurBody)
                    .lineLimit(2)
                Text("\(base.district) · \(base.address)")
                    .font(.samurCaption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 3)
    }
}

// MARK: - Comunicaciones tab

private let comunicacionesKeys = ["plantillas", "grupos", "tetra", "estatus"]

private struct ComunicacionesTab: View {
    let sections: [CheatsheetSection]
    @Binding var selectedKey: String
    @Namespace private var subPickerNS

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
            // Sub-section picker — same sliding indicator treatment
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(filteredSections) { section in
                        let isSelected = selectedKey == section.key
                        Button {
                            withAnimation(.spring(response: 0.32, dampingFraction: 0.78)) {
                                selectedKey = section.key
                            }
                            HapticFeedback.selection()
                        } label: {
                            Text(section.title)
                                .font(.samurCaption.weight(isSelected ? .semibold : .medium))
                                .foregroundStyle(isSelected ? .white : .secondary)
                                .padding(.horizontal, 13)
                                .padding(.vertical, 7)
                                .background {
                                    if isSelected {
                                        Capsule()
                                            .fill(Color.samurPrimary)
                                            .matchedGeometryEffect(id: "subIndicator", in: subPickerNS)
                                    }
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 14)
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
                VStack(spacing: 10) {
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
        VStack(alignment: .leading, spacing: 7) {
            if let title = item.title, !title.isEmpty {
                Text(title)
                    .font(.samurHeadline)
            }
            ForEach(item.lines ?? [], id: \.self) { line in
                HStack(alignment: .top, spacing: 8) {
                    Circle()
                        .fill(Color.samurPrimary.opacity(0.5))
                        .frame(width: 5, height: 5)
                        .padding(.top, 6)
                    Text(line)
                        .font(.samurCallout)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .samurGlassCard(cornerRadius: 12, tint: Color.samurPrimary)
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
            HStack(alignment: .top, spacing: 8) {
                Text(item.value(for: columns[0]) ?? "")
                    .font(.samurBody.weight(.semibold))
                    .frame(minWidth: 60, alignment: .leading)
                Text(item.value(for: columns[1]) ?? "")
                    .font(.samurBody)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 2)
        } else if columns.count >= 3 {
            VStack(alignment: .leading, spacing: 3) {
                Text(item.value(for: columns[0]) ?? "")
                    .font(.samurBody.weight(.semibold))
                HStack(spacing: 12) {
                    ForEach(columns.dropFirst(), id: \.self) { col in
                        if let val = item.value(for: col), !val.isEmpty {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(col)
                                    .font(.samurCaption2)
                                    .foregroundStyle(.tertiary)
                                Text(val)
                                    .font(.samurCaption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .padding(.vertical, 2)
        } else {
            Text(item.title ?? "")
                .font(.samurBody)
        }
    }
}

// MARK: - Codes tab

private struct CodeGroup {
    let category: String
    let subcategories: [(name: String?, codes: [Code])]
}

private struct CodesTab: View {
    let selectedType: String
    let codes: [Code]
    @Binding var showScrollToTop: Bool
    let onSelect: (Code) -> Void

    private var codeGroups: [CodeGroup] {
        var categoryMap: [String: [Code]] = [:]
        var categoryOrder: [String] = []
        var seenCats = Set<String>()
        for code in codes {
            let cat = code.category ?? "General"
            if seenCats.insert(cat).inserted { categoryOrder.append(cat) }
            categoryMap[cat, default: []].append(code)
        }

        return categoryOrder.map { cat in
            let catCodes = categoryMap[cat]!
            let hasSubcategories = catCodes.contains { $0.subcategory != nil }
            guard hasSubcategories else {
                return CodeGroup(category: cat, subcategories: [(name: nil, codes: catCodes)])
            }

            var ungrouped: [Code] = []
            var subMap: [String: [Code]] = [:]
            var subOrder: [String] = []
            var seenSubs = Set<String>()
            for code in catCodes {
                if let sub = code.subcategory {
                    if seenSubs.insert(sub).inserted { subOrder.append(sub) }
                    subMap[sub, default: []].append(code)
                } else {
                    ungrouped.append(code)
                }
            }

            var subcategories: [(name: String?, codes: [Code])] = []
            if !ungrouped.isEmpty { subcategories.append((name: nil, codes: ungrouped)) }
            for sub in subOrder { subcategories.append((name: sub, codes: subMap[sub]!)) }
            return CodeGroup(category: cat, subcategories: subcategories)
        }
    }

    private var showNoReportLegend: Bool {
        (selectedType == "sva" || selectedType == "svb") && codes.contains { $0.noReport == true }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                    Color.clear
                        .frame(height: 1)
                        .id("top")
                        .onAppear { showScrollToTop = false }
                        .onDisappear { showScrollToTop = true }

                    ForEach(codeGroups, id: \.category) { group in
                        Section {
                            ForEach(group.subcategories, id: \.name) { sub in
                                if let subName = sub.name {
                                    SubcategoryDividerRow(name: subName)
                                }
                                ForEach(sub.codes) { code in
                                    VStack(spacing: 0) {
                                        CodeRow(code: code, indented: sub.name != nil)
                                            .contentShape(Rectangle())
                                            .onTapGesture { onSelect(code) }
                                            .padding(.horizontal, 16)
                                            .padding(.vertical, 7)
                                        Divider().padding(.leading, sub.name != nil ? 32 : 16)
                                    }
                                }
                            }
                        } header: {
                            Text(group.category)
                                .font(.samurCaption.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .textCase(.uppercase)
                                .tracking(0.4)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 7)
                                .background(.ultraThinMaterial)
                        }
                    }

                    if showNoReportLegend {
                        HStack(spacing: 6) {
                            Image(systemName: "doc.badge.minus")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            Text("Los códigos marcados con ⊘ no generan informe asistencial")
                                .font(.samurCaption2)
                                .foregroundStyle(.secondary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
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
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(Color.samurPrimary)
                            .padding(8)
                    }
                    .padding(.trailing, 16)
                    .padding(.bottom, 16)
                    .transition(.opacity.combined(with: .scale(scale: 0.8)))
                }
            }
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: showScrollToTop)
        }
    }
}

private struct SubcategoryDividerRow: View {
    let name: String

    var body: some View {
        Text(name)
            .font(.samurCaption.weight(.semibold))
            .foregroundStyle(.tertiary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 32)
            .padding(.trailing, 16)
            .padding(.vertical, 5)
            .background(Color.secondary.opacity(0.04))
    }
}

// MARK: - CodeRow

struct CodeRow: View {
    let code: Code
    var indented: Bool = false

    var body: some View {
        HStack(spacing: 10) {
            if indented {
                Spacer().frame(width: 12)
            }
            Text(code.code)
                .font(.samurMonoBody)
                .foregroundStyle(.white)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .background(Color.samurPrimary, in: RoundedRectangle(cornerRadius: 7))
                .fixedSize()

            Text(code.name)
                .font(.samurBody)
                .lineLimit(2)

            Spacer(minLength: 4)

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
