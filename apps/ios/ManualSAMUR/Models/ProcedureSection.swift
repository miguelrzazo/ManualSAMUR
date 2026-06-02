import Foundation

struct ProcedureSection: Hashable, Identifiable {
    var id: String { section }
    let section: String
    let displayName: String
    let colorHex: String
    let procedures: [Procedure]

    var isFlatSection: Bool {
        ["administrativos", "comunicaciones", "drp", "intervinientes"].contains(section)
    }

    static func == (lhs: ProcedureSection, rhs: ProcedureSection) -> Bool {
        lhs.section == rhs.section
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(section)
    }
}
