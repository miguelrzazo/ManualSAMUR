import SwiftUI

struct SectionBadge: View {
    let label: String
    let color: Color

    var body: some View {
        Text(label)
            .font(.samurCaption2.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.12), in: Capsule())
            .overlay(Capsule().strokeBorder(color.opacity(0.2), lineWidth: 0.5))
    }
}
