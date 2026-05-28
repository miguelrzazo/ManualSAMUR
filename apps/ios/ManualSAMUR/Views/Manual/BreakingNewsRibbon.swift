import SwiftUI

struct BreakingNewsRibbon: View {
    let events: [ManualUpdateEvent]
    let unseenCount: Int
    let onTap: () -> Void

    private var tickerText: String {
        events.prefix(8).map(\.summary).joined(separator: "   ·   ")
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Spacing.sm + 2) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .symbolEffect(.variableColor.iterative.dimInactiveLayers, options: .repeating)
                    .frame(width: 16)

                if unseenCount > 0 {
                    Text("\(unseenCount)")
                        .font(.samurCaption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(.white.opacity(0.22), in: Capsule())
                }

                MarqueeText(text: tickerText)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity)
            .background(Color(hex: "#DC2626"))
        }
        .buttonStyle(.plain)
        .onAppear { HapticFeedback.warning() }
    }
}

// MARK: - Marquee ticker

private struct MarqueeText: View {
    let text: String
    @State private var offset: CGFloat = 0
    @State private var contentWidth: CGFloat = 1

    var body: some View {
        HStack(spacing: 48) {
            tickerLabel
            tickerLabel
        }
        .fixedSize()
        .offset(x: offset)
        .background(
            GeometryReader { g in
                Color.clear.preference(key: MarqueeWidthKey.self, value: g.size.width / 2)
            }
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipped()
        .onPreferenceChange(MarqueeWidthKey.self) { w in
            guard w > 1, w != contentWidth else { return }
            contentWidth = w
            startAnimation(width: w)
        }
    }

    private var tickerLabel: some View {
        Text(text)
            .font(.samurCaption)
            .foregroundStyle(.white.opacity(0.9))
            .fixedSize()
    }

    private func startAnimation(width: CGFloat) {
        offset = 0
        let duration = Double(width) / 60.0
        withAnimation(.linear(duration: duration).repeatForever(autoreverses: false)) {
            offset = -(width + 48)
        }
    }
}

private struct MarqueeWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
