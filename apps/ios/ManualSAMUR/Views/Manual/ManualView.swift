import SwiftUI

// MARK: - ManualView (Home)

struct ManualView: View {
    @Environment(DataStore.self) private var store
    @State private var showSearch = false
    @State private var showMenu = false
    @State private var showHistorial = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Breaking news ribbon
                if store.hasNewsThisWeek {
                    BreakingNewsRibbon(
                        events: store.updateEvents.filter { $0.isNewThisWeek },
                        unseenCount: store.unseenEventCount
                    ) {
                        showHistorial = true
                    }
                }

                // Favorites row
                let favorites = store.favoriteProcedures
                if !favorites.isEmpty {
                    ProcedureQuickRow(
                        title: "Favoritos",
                        systemImage: "heart.fill",
                        tint: .red,
                        procedures: favorites
                    )
                    Divider().padding(.leading, 16)
                }

                // Recents row
                let recents = store.recentProcedures
                if !recents.isEmpty {
                    ProcedureQuickRow(
                        title: "Recientes",
                        systemImage: "clock",
                        tint: .secondary,
                        procedures: recents
                    )
                    Divider().padding(.leading, 16)
                }

                // Section cards grid
                SectionCardsGrid(sections: store.procedureSections)
            }
        }
        .samurPageBackground()
        .navigationTitle("Manual")
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .navigationDestination(for: Procedure.self) { procedure in
            ProcedureDetailView(procedure: procedure)
                .onAppear { store.recordRecent(procedure.id) }
        }
        .navigationDestination(for: ProcedureSection.self) { section in
            SectionDetailView(section: section)
        }
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
        .sheet(isPresented: $showSearch) { GlobalSearchView() }
        .sheet(isPresented: $showMenu) {
            AppMenuSheet().presentationDetents([.large])
        }
        .sheet(isPresented: $showHistorial) { HistorialView() }
    }
}

// MARK: - Procedure Quick Row

private struct ProcedureQuickRow: View {
    let title: String
    let systemImage: String
    let tint: Color
    let procedures: [Procedure]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(tint)
                Text(title)
                    .font(.samurSubheadline)
                    .foregroundStyle(.primary)
            }
            .padding(.horizontal, 16)
            .padding(.top, 14)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(procedures.prefix(10)) { procedure in
                        NavigationLink(value: procedure) {
                            ProcedurePill(procedure: procedure)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 12)
            }
        }
    }
}

struct ProcedurePill: View {
    let procedure: Procedure

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 7) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(procedure.color)
                    .frame(width: 3, height: 28)
                Text(procedure.title)
                    .font(.samurCaption.weight(.medium))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: 132, alignment: .leading)
            }
            Text(procedure.id)
                .font(.samurMono)
                .foregroundStyle(.secondary)
                .padding(.leading, 10)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .samurGlassCard(cornerRadius: 12, tint: procedure.color)
        .pressScale()
    }
}

// MARK: - Section Cards Grid

private struct SectionCardsGrid: View {
    let sections: [ProcedureSection]

    private let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Secciones")
                .font(.samurCaption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.5)
                .padding(.horizontal, 16)
                .padding(.top, 20)
                .padding(.bottom, 10)

            LazyVGrid(columns: columns, spacing: 10) {
                ForEach(sections) { section in
                    NavigationLink(value: section) {
                        SectionCard(section: section)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
    }
}

private struct SectionCard: View {
    let section: ProcedureSection

    var body: some View {
        let color = Color(hex: section.colorHex)

        HStack(spacing: 0) {
            // Coloured left accent bar — the only opaque element, punches through the glass
            Rectangle()
                .fill(
                    LinearGradient(
                        colors: [color, color.opacity(0.7)],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                )
                .frame(width: 3)
                .clipShape(
                    .rect(
                        topLeadingRadius: 12,
                        bottomLeadingRadius: 12,
                        bottomTrailingRadius: 0,
                        topTrailingRadius: 0
                    )
                )

            HStack(spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(section.displayName)
                        .font(.samurSubheadline)
                        .foregroundStyle(.primary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                    Text("\(section.procedures.count) proc.")
                        .font(.samurCaption2)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 0)

                Image(systemName: "chevron.right")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(color.opacity(0.6))
            }
            .padding(.horizontal, 11)
            .padding(.vertical, 12)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .samurGlassCard(cornerRadius: 12, tint: color)
        .pressScale()
    }
}

// MARK: - ProcedureRow (shared with SectionDetailView)

struct ProcedureRow: View {
    let procedure: Procedure
    var showSection: Bool = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 3)
                .fill(procedure.color)
                .frame(width: 3, height: 40)

            VStack(alignment: .leading, spacing: 3) {
                Text(procedure.title)
                    .font(.samurBody)
                    .lineLimit(2)

                HStack(spacing: 6) {
                    Text(procedure.id)
                        .font(.samurMono)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 4))

                    if showSection {
                        SectionBadge(label: procedure.sectionDisplayName, color: procedure.color)
                    }
                }
            }
        }
        .padding(.vertical, 3)
    }
}
