import SwiftUI

// MARK: - Instrument Sans semantic type scale
//
// Falls back gracefully to system font if the font files are not bundled.
// Font files expected at Resources/Fonts/:
//   InstrumentSans-Regular.ttf, -Medium.ttf, -SemiBold.ttf, -Bold.ttf

extension Font {

    // MARK: Factory

    static func instrument(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .custom("InstrumentSans-\(weight.instrumentPostfix)", size: size)
    }

    // MARK: Semantic scale

    static let samurLargeTitle  = instrument(34, weight: .bold)
    static let samurTitle       = instrument(28, weight: .bold)
    static let samurTitle2      = instrument(22, weight: .semibold)
    static let samurTitle3      = instrument(20, weight: .semibold)
    static let samurHeadline    = instrument(17, weight: .semibold)
    static let samurBody        = instrument(17, weight: .regular)
    static let samurCallout     = instrument(16, weight: .regular)
    static let samurSubheadline = instrument(15, weight: .semibold)
    static let samurFootnote    = instrument(13, weight: .regular)
    static let samurCaption     = instrument(12, weight: .regular)
    static let samurCaption2    = instrument(11, weight: .regular)
    /// Uppercase section header label — 10pt, bold, 0.5pt tracking
    static let samurLabel       = instrument(10, weight: .bold)

    // MARK: Monospace (SF Mono — system, no bundle needed)

    static let samurMono     = Font.system(.caption, design: .monospaced, weight: .semibold)
    static let samurMonoBody = Font.system(.callout,  design: .monospaced, weight: .medium)
}

// MARK: - Font.Weight → Instrument Sans postfix

private extension Font.Weight {
    var instrumentPostfix: String {
        switch self {
        case .bold:     return "Bold"
        case .semibold: return "SemiBold"
        case .medium:   return "Medium"
        default:        return "Regular"
        }
    }
}
