import SwiftUI

// MARK: - Tab enum

enum VademecumTab: String, CaseIterable {
    case farmacos     = "farmacos"
    case perfusiones  = "perfusiones"
    case fluidos      = "fluidos"
    case comerciales  = "comerciales"

    var label: String {
        switch self {
        case .farmacos:    return "Fármacos"
        case .perfusiones: return "Perfusiones"
        case .fluidos:     return "Fluidos"
        case .comerciales: return "Comerciales"
        }
    }
}

// MARK: - VademecumView

struct VademecumView: View {
    @Environment(DataStore.self) private var store

    @State private var selectedTab: VademecumTab = .farmacos
    @State private var selectedDrug: Drug?
    @State private var selectedPerfusion: Perfusion?
    @State private var selectedFluid: Fluid?
    @State private var showSearch = false
    @State private var showMenu = false
    @State private var showScrollToTop = false

    var body: some View {
        VStack(spacing: 0) {
            tabPicker
            Divider()
            mainContent
        }
        .navigationTitle("Vademécum")
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
        .sheet(item: $selectedDrug) { drug in
            DrugDetailView(drug: drug)
                .presentationDetents([.large])
        }
        .sheet(item: $selectedPerfusion) { perfusion in
            PerfusionDetailView(perfusion: perfusion)
                .presentationDetents([.large])
        }
        .sheet(item: $selectedFluid) { fluid in
            FluidDetailView(fluid: fluid)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showSearch) {
            GlobalSearchView()
        }
        .sheet(isPresented: $showMenu) {
            AppMenuSheet()
                .presentationDetents([.large])
        }
    }

    // MARK: - Tab picker

    private var tabPicker: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(VademecumTab.allCases, id: \.self) { tab in
                    Button {
                        selectedTab = tab
                        showScrollToTop = false
                    } label: {
                        Text(tab.label)
                            .font(.subheadline.weight(selectedTab == tab ? .semibold : .regular))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(
                                selectedTab == tab ? Color.samurBlue : Color.secondary.opacity(0.12),
                                in: Capsule()
                            )
                            .foregroundStyle(selectedTab == tab ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
    }

    // MARK: - Main content

    @ViewBuilder
    private var mainContent: some View {
        switch selectedTab {
        case .farmacos:
            FarmacosTab(
                groups: store.drugsSortedAlphabetically,
                showScrollToTop: $showScrollToTop,
                onSelect: { selectedDrug = $0 }
            )
        case .perfusiones:
            PerfusionesTab(
                groups: store.perfusionesByCategory,
                onSelect: { selectedPerfusion = $0 }
            )
            .onAppear { showScrollToTop = false }
        case .fluidos:
            FluidosTab(
                fluidos: store.fluidos,
                onSelect: { selectedFluid = $0 }
            )
            .onAppear { showScrollToTop = false }
        case .comerciales:
            ComercialesTab(
                groups: store.comercialesSortedAlphabetically,
                drugById: store.drugById,
                onSelect: { selectedDrug = $0 }
            )
            .onAppear { showScrollToTop = false }
        }
    }
}

// MARK: - Fármacos tab

private struct FarmacosTab: View {
    let groups: [(letter: String, items: [Drug])]
    @Binding var showScrollToTop: Bool
    let onSelect: (Drug) -> Void

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

                    ForEach(groups, id: \.letter) { group in
                        Section {
                            ForEach(group.items) { drug in
                                VStack(spacing: 0) {
                                    DrugRow(drug: drug)
                                        .contentShape(Rectangle())
                                        .onTapGesture { onSelect(drug) }
                                        .padding(.horizontal, 16)
                                        .padding(.vertical, 8)
                                    Divider().padding(.leading, 16)
                                }
                            }
                        } header: {
                            Text(group.letter)
                                .font(.subheadline.weight(.bold))
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 16)
                                .padding(.vertical, 6)
                                .background(.background)
                        }
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

// MARK: - Perfusiones tab

private struct PerfusionesTab: View {
    let groups: [(category: String, items: [Perfusion])]
    let onSelect: (Perfusion) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                ForEach(groups, id: \.category) { group in
                    Section {
                        ForEach(group.items) { perfusion in
                            VStack(spacing: 0) {
                                PerfusionRow(perfusion: perfusion)
                                    .contentShape(Rectangle())
                                    .onTapGesture { onSelect(perfusion) }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
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
            }
        }
    }
}

// MARK: - Fluidos tab

private struct FluidosTab: View {
    let fluidos: [Fluid]
    let onSelect: (Fluid) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0) {
                ForEach(fluidos) { fluid in
                    VStack(spacing: 0) {
                        FluidRow(fluid: fluid)
                            .contentShape(Rectangle())
                            .onTapGesture { onSelect(fluid) }
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                        Divider().padding(.leading, 16)
                    }
                }
            }
        }
    }
}

// MARK: - Comerciales tab

private struct ComercialesTab: View {
    let groups: [(letter: String, items: [CommercialDrug])]
    let drugById: [String: Drug]
    let onSelect: (Drug) -> Void

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 0, pinnedViews: .sectionHeaders) {
                ForEach(groups, id: \.letter) { group in
                    Section {
                        ForEach(group.items) { commercial in
                            VStack(spacing: 0) {
                                CommercialRow(commercial: commercial)
                                    .contentShape(Rectangle())
                                    .onTapGesture {
                                        if let drug = drugById[commercial.drugId] {
                                            onSelect(drug)
                                        }
                                    }
                                    .padding(.horizontal, 16)
                                    .padding(.vertical, 8)
                                Divider().padding(.leading, 16)
                            }
                        }
                    } header: {
                        Text(group.letter)
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 6)
                            .background(.background)
                    }
                }
            }
        }
    }
}

// MARK: - Row views

private struct DrugRow: View {
    let drug: Drug

    var body: some View {
        HStack(spacing: 10) {
            Circle()
                .fill(drug.categoryColor)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 3) {
                Text(drug.name)
                    .font(.body)
                if let synonyms = drug.synonyms, !synonyms.isEmpty {
                    Text(synonyms.prefix(3).joined(separator: " · "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

private struct PerfusionRow: View {
    let perfusion: Perfusion

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(perfusion.drug)
                    .font(.body.weight(.semibold))
                Spacer()
                Text(perfusion.category)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 3)
                    .background(Color.samurBlue.opacity(0.8), in: Capsule())
            }
            Text(perfusion.recipe)
                .font(.caption)
                .foregroundStyle(.secondary)
                .lineLimit(2)
            Text("Ritmo: \(perfusion.rate)")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

private struct FluidRow: View {
    let fluid: Fluid

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(fluid.name)
                    .font(.body)
                Text(fluid.type)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            if let osmolarity = fluid.osmolarity {
                Text(osmolarity)
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}

private struct CommercialRow: View {
    let commercial: CommercialDrug

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(commercial.activeIngredient)
                .font(.body.weight(.semibold))
            if !commercial.brandNames.isEmpty {
                Text(commercial.brandNames.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let presentation = commercial.presentation {
                Text(presentation)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 2)
    }
}
