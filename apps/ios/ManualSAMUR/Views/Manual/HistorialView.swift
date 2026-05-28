import SwiftUI

// MARK: - HistorialView

struct HistorialView: View {
    @Environment(DataStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private var groupedEvents: [(date: String, events: [ManualUpdateEvent])] {
        let sorted = store.updateEvents.sorted { $0.effectiveDate > $1.effectiveDate }
        var groups: [(date: String, events: [ManualUpdateEvent])] = []
        var dateMap: [String: [ManualUpdateEvent]] = [:]
        var dateOrder: [String] = []
        for event in sorted {
            if dateMap[event.effectiveDate] == nil { dateOrder.append(event.effectiveDate) }
            dateMap[event.effectiveDate, default: []].append(event)
        }
        for date in dateOrder {
            groups.append((date: date, events: dateMap[date]!))
        }
        return groups
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.updateEvents.isEmpty {
                    ContentUnavailableView(
                        "Sin historial",
                        systemImage: "clock.badge.questionmark",
                        description: Text("No hay actualizaciones disponibles")
                    )
                } else {
                    List {
                        ForEach(groupedEvents, id: \.date) { group in
                            Section {
                                ForEach(group.events) { event in
                                    EventRow(event: event)
                                }
                            } header: {
                                HStack(spacing: Spacing.sm) {
                                    Text(formatDate(group.date))
                                        .font(.samurSubheadline)
                                        .foregroundStyle(.primary)
                                    if group.events.contains(where: { $0.isNewThisWeek && !store.seenEventIds.contains($0.eventId) }) {
                                        Text("NUEVO")
                                            .font(.samurCaption2.weight(.bold))
                                            .foregroundStyle(.white)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.red, in: Capsule())
                                    }
                                }
                                .textCase(nil)
                                .padding(.vertical, Spacing.xs)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Actualizaciones")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Radius.lg)
        .onAppear { store.markAllNewEventsSeen() }
    }

    private func formatDate(_ raw: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "es_ES")
        guard let date = formatter.date(from: raw) else { return raw }
        let out = DateFormatter()
        out.dateFormat = "d 'de' MMMM 'de' yyyy"
        out.locale = Locale(identifier: "es_ES")
        return out.string(from: date)
    }
}

// MARK: - EventRow

private struct EventRow: View {
    let event: ManualUpdateEvent
    @State private var showDiff = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                ChangeKindBadge(kind: event.changeKind)
                CategoryIcon(category: event.category)
                Spacer(minLength: 0)
                if event.isNewThisWeek {
                    Circle()
                        .fill(Color.red)
                        .frame(width: 8, height: 8)
                        .padding(.top, 3)
                }
            }

            Text(event.summary)
                .font(.samurCallout)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)

            if event.diff != nil {
                Button {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { showDiff.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: showDiff ? "chevron.up" : "chevron.down")
                            .font(.caption2)
                        Text(showDiff ? "Ocultar cambios" : "Ver cambios")
                            .font(.samurCaption)
                    }
                    .foregroundStyle(Color.samurPrimary)
                }
                .buttonStyle(.plain)

                if showDiff, let diff = event.diff {
                    DiffView(diff: diff)
                        .padding(.top, 4)
                }
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - ChangeKindBadge

struct ChangeKindBadge: View {
    let kind: String

    private var label: String {
        switch kind {
        case "nuevo": return "NUEVO"
        case "actualizado": return "ACTUALIZADO"
        case "revisado": return "REVISADO"
        case "eliminado": return "ELIMINADO"
        case "sync": return "SYNC"
        default: return kind.uppercased()
        }
    }

    private var color: Color {
        switch kind {
        case "nuevo": return .green
        case "actualizado": return .blue
        case "revisado": return Color(hue: 0.1, saturation: 0.9, brightness: 0.9)
        case "eliminado": return .red
        default: return .secondary
        }
    }

    var body: some View {
        Text(label)
            .font(.samurCaption2.weight(.bold))
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 3)
            .background(color.opacity(0.12), in: Capsule())
            .overlay(Capsule().strokeBorder(color.opacity(0.2), lineWidth: 0.5))
    }
}

// MARK: - CategoryIcon

private struct CategoryIcon: View {
    let category: String?

    private var systemImage: String {
        switch category {
        case "procedure": return "doc.text"
        case "codigo": return "antenna.radiowaves.left.and.right"
        case "vademecum": return "pill"
        default: return "doc.text"
        }
    }

    var body: some View {
        Image(systemName: systemImage)
            .font(.caption)
            .foregroundStyle(.secondary)
    }
}

// MARK: - DiffView

private struct DiffView: View {
    let diff: String

    private var lines: [(text: String, kind: LineKind)] {
        diff.components(separatedBy: "\n").map { line in
            if line.hasPrefix("+") && !line.hasPrefix("+++") {
                return (text: line, kind: .added)
            } else if line.hasPrefix("-") && !line.hasPrefix("---") {
                return (text: line, kind: .removed)
            } else {
                return (text: line, kind: .context)
            }
        }
    }

    enum LineKind { case added, removed, context }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                Text(line.text.isEmpty ? " " : line.text)
                    .font(.samurMono)
                    .foregroundStyle(lineColor(line.kind))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 1)
                    .background(lineBackground(line.kind))
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(Color.secondary.opacity(0.2), lineWidth: 1)
        )
    }

    private func lineColor(_ kind: LineKind) -> Color {
        switch kind {
        case .added: return .green
        case .removed: return .red
        case .context: return .secondary
        }
    }

    private func lineBackground(_ kind: LineKind) -> Color {
        switch kind {
        case .added: return Color.green.opacity(0.06)
        case .removed: return Color.red.opacity(0.06)
        case .context: return Color.clear
        }
    }
}
