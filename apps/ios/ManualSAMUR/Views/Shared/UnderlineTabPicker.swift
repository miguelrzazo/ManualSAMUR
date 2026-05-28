import SwiftUI

/// Scrollable underline tab bar — works for any number of tabs.
/// Uses matchedGeometryEffect on the indicator line only (not the label).
struct UnderlineTabPicker<T: Hashable>: View {
    let tabs: [(label: String, value: T)]
    @Binding var selection: T
    @Namespace private var indicatorNS

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(tabs, id: \.value) { tab in
                        let isSelected = selection == tab.value

                        Button {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.75)) {
                                selection = tab.value
                            }
                            HapticFeedback.selection()
                        } label: {
                            VStack(spacing: Spacing.xs) {
                                Text(tab.label)
                                    .font(isSelected ? .samurSubheadline : .samurCallout)
                                    .foregroundStyle(isSelected ? Color.samurPrimary : Color.secondary)
                                    .padding(.horizontal, Spacing.lg)
                                    .padding(.top, Spacing.sm)
                                    .padding(.bottom, Spacing.sm - 2)

                                if isSelected {
                                    RoundedRectangle(cornerRadius: 1.5)
                                        .fill(Color.samurPrimary)
                                        .frame(height: 2)
                                        .matchedGeometryEffect(id: "indicator", in: indicatorNS)
                                } else {
                                    Color.clear.frame(height: 2)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .id(tab.value)
                    }
                }
            }
            .onChange(of: selection) { _, newValue in
                withAnimation { proxy.scrollTo(newValue, anchor: .center) }
            }
        }
        .overlay(alignment: .bottom) {
            Divider()
        }
    }
}
