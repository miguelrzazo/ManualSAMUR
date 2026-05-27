import SwiftUI

struct ManualView: View {
    @Environment(DataStore.self) private var store
    @State private var showSearch = false
    @State private var showMenu = false
    @State private var selectedSection: String? = nil

    var body: some View {
        VStack(spacing: 0) {
            sectionJumpStrip
            Divider()
            sectionedList
        }
        .navigationTitle("Manual")
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
        .sheet(isPresented: $showSearch) {
            GlobalSearchView()
        }
        .sheet(isPresented: $showMenu) {
            AppMenuSheet()
                .presentationDetents([.large])
        }
    }

    // MARK: - Section jump strip

    private var sectionJumpStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(store.proceduresBySection, id: \.section) { group in
                    let isSelected = selectedSection == group.section
                    Button {
                        selectedSection = group.section
                    } label: {
                        Text(group.items.first?.sectionDisplayName ?? group.section.capitalized)
                            .font(.subheadline.weight(isSelected ? .semibold : .regular))
                            .padding(.horizontal, 14)
                            .padding(.vertical, 7)
                            .background(
                                isSelected ? Color.samurBlue : Color.secondary.opacity(0.12),
                                in: Capsule()
                            )
                            .foregroundStyle(isSelected ? .white : .primary)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal)
            .padding(.vertical, 10)
        }
    }

    // MARK: - Sections list

    private var sectionedList: some View {
        ScrollViewReader { proxy in
            List {
                ForEach(store.proceduresBySection, id: \.section) { group in
                    Section {
                        ForEach(group.items) { procedure in
                            NavigationLink(value: procedure) {
                                ProcedureRow(procedure: procedure)
                            }
                        }
                    } header: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color(hex: group.items.first?.sectionColor ?? "#64748B"))
                                .frame(width: 8, height: 8)
                            Text(group.items.first?.sectionDisplayName ?? group.section.capitalized)
                                .font(.subheadline.weight(.semibold))
                        }
                        .id(group.section)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationDestination(for: Procedure.self) { procedure in
                ProcedureDetailView(procedure: procedure)
            }
            .onChange(of: selectedSection) { _, newSection in
                guard let section = newSection else { return }
                withAnimation {
                    proxy.scrollTo(section, anchor: .top)
                }
            }
        }
    }
}

// MARK: - Row

private struct ProcedureRow: View {
    let procedure: Procedure
    var showSection: Bool = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 4)
                .fill(procedure.color)
                .frame(width: 4, height: 36)

            VStack(alignment: .leading, spacing: 2) {
                Text(procedure.title)
                    .font(.body)
                    .lineLimit(2)

                HStack(spacing: 6) {
                    Text(procedure.id)
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)

                    if showSection {
                        SectionBadge(label: procedure.sectionDisplayName, color: procedure.color)
                    }
                }
            }
        }
        .padding(.vertical, 2)
    }
}
