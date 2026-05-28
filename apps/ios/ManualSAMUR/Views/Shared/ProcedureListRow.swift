import SwiftUI

struct ProcedureListRow<Trailing: View>: View {
    let color: Color
    let title: String
    var subtitle: String? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Rectangle()
                .fill(color)
                .frame(width: 3)

            HStack(spacing: Spacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.samurSubheadline)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    if let subtitle {
                        Text(subtitle)
                            .font(.samurFootnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: Spacing.sm)
                trailing()
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm + 2)
        }
        .frame(minHeight: 44)
        .background(Color(.secondarySystemGroupedBackground))
    }
}

// MARK: - Convenience initialisers

private struct RowChevron: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(Color(.tertiaryLabel))
    }
}

extension ProcedureListRow where Trailing == RowChevron {
    /// Row with a chevron (navigation rows).
    init(color: Color, title: String, subtitle: String? = nil) {
        self.color = color
        self.title = title
        self.subtitle = subtitle
        self.trailing = { RowChevron() }
    }
}

extension ProcedureListRow where Trailing == EmptyView {
    /// Row with no trailing element.
    init(color: Color, title: String, subtitle: String? = nil, noTrailing: Bool = true) {
        self.color = color
        self.title = title
        self.subtitle = subtitle
        self.trailing = { EmptyView() }
    }
}
