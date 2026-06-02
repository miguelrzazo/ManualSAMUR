import SwiftUI

struct SectionDetailView: View {
    let section: ProcedureSection

    // Group procedures by sidebarGroup, preserving encounter order
    private var groupedProcedures: [(group: String, items: [Procedure])] {
        var grouped: [String: [Procedure]] = [:]
        var order: [String] = []
        for p in section.procedures {
            let g = section.isFlatSection ? "Listado" : p.sidebarGroup
            if grouped[g] == nil { order.append(g) }
            grouped[g, default: []].append(p)
        }
        return order.map { (group: $0, items: grouped[$0]!) }
    }

    var body: some View {
        List {
            if section.isFlatSection || groupedProcedures.count == 1 {
                ForEach(section.procedures) { procedure in
                    NavigationLink(value: procedure) {
                        ProcedureRow(procedure: procedure)
                    }
                }
            } else {
                ForEach(groupedProcedures, id: \.group) { group in
                    Section {
                        ForEach(group.items) { procedure in
                            NavigationLink(value: procedure) {
                                ProcedureRow(procedure: procedure)
                            }
                        }
                    } header: {
                        Text(group.group)
                            .font(.samurCaption.weight(.semibold))
                            .textCase(.uppercase)
                            .tracking(0.4)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle(section.displayName)
    }
}
