import SwiftUI

// MARK: - ManualView (Home)

struct ManualView: View {
    @Environment(DataStore.self) private var store
    @State private var showSearch = false
    @State private var showMenu = false
    @State private var showHistorial = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Spacing.xl) {
                let recents = store.recentProcedures
                if !recents.isEmpty {
                    SectionGroup(title: "Recientes") {
                        ForEach(Array(recents.prefix(5).enumerated()), id: \.element.id) { i, procedure in
                            if i > 0 { Divider().padding(.leading, Spacing.md) }
                            NavigationLink(value: procedure) {
                                ProcedureListRow(
                                    color: procedure.color,
                                    title: procedure.title
                                )
                                .pressScale()
                            }
                            .buttonStyle(.plain)
                            .onTapGesture { HapticFeedback.light() }
                        }
                    }
                }

                let favorites = store.favoriteProcedures
                if !favorites.isEmpty {
                    SectionGroup(title: "Favoritos") {
                        ForEach(Array(favorites.enumerated()), id: \.element.id) { i, procedure in
                            if i > 0 { Divider().padding(.leading, Spacing.md) }
                            NavigationLink(value: procedure) {
                                ProcedureListRow(color: procedure.color, title: procedure.title) {
                                    Image(systemName: "star.fill")
                                        .font(.caption)
                                        .foregroundStyle(.yellow)
                                }
                                .pressScale()
                            }
                            .buttonStyle(.plain)
                            .onTapGesture { HapticFeedback.light() }
                        }
                    }
                }

                SectionGroup(title: "Secciones") {
                    ForEach(Array(store.procedureSections.enumerated()), id: \.element.id) { i, section in
                        if i > 0 { Divider().padding(.leading, Spacing.md) }
                        NavigationLink(value: section) {
                            ProcedureListRow(
                                color: Color(hex: section.colorHex),
                                title: section.displayName,
                                subtitle: "\(section.procedures.count) procedimientos"
                            )
                            .pressScale()
                        }
                        .buttonStyle(.plain)
                        .onTapGesture { HapticFeedback.light() }
                    }
                }

                // Historial button — always at bottom
                Button {
                    showHistorial = true
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: Spacing.md) {
                        Image(systemName: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("Historial de actualizaciones")
                            .font(.samurSubheadline)
                            .foregroundStyle(.primary)
                        Spacer()
                        if store.unseenEventCount > 0 {
                            Text("\(store.unseenEventCount)")
                                .font(.samurCaption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Color.red, in: Capsule())
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color(.tertiaryLabel))
                    }
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.md)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    .cardShadow()
                    .pressScale()
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.md)
            .padding(.bottom, Spacing.xl)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .top, spacing: 0) {
            if store.hasNewsThisWeek && store.unseenEventCount > 0 {
                BreakingNewsRibbon(
                    events: store.updateEvents.filter { $0.isNewThisWeek },
                    unseenCount: store.unseenEventCount
                ) {
                    store.markAllNewEventsSeen()
                    showHistorial = true
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: store.unseenEventCount)
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

// MARK: - ProcedureRow (used by SectionDetailView — keep unchanged)

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

// MARK: - ProcedurePill (kept for GlobalSearchView compatibility — remove after search is updated)

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
