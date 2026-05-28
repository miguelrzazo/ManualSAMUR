// apps/ios/ManualSAMUR/Views/Shared/DesignSystem.swift
import SwiftUI

enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
}

enum Radius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 10
    static let lg: CGFloat = 14
}

extension View {
    func cardShadow() -> some View {
        self
            .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
            .shadow(color: .black.opacity(0.04), radius: 8, y: 3)
    }
}
