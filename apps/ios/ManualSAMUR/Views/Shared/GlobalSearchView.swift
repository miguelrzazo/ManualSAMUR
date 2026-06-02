import SwiftUI

struct GlobalSearchView: View {
    @Environment(DataStore.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @FocusState private var isFocused: Bool
    @State private var selectedDrug: Drug?
    @State private var selectedCode: Code?

    private var matchedProcedures: [Procedure] {
        guard searchText.count >= 2 else { return [] }
        return store.procedures.filter { $0.matches(searchText) }
    }

    private var matchedDrugs: [Drug] {
        guard searchText.count >= 2 else { return [] }
        return store.drugs.filter { $0.matches(searchText) }
    }

    private var matchedCodes: [Code] {
        guard searchText.count >= 2 else { return [] }
        return store.codes.values.flatMap { $0 }.filter { $0.matches(searchText) }
    }

    private var hasResults: Bool {
        !matchedProcedures.isEmpty || !matchedDrugs.isEmpty || !matchedCodes.isEmpty
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                searchBar
                Divider()
                resultsList
            }
            .navigationBarHidden(true)
        }
        .sheet(item: $selectedDrug) { drug in
            DrugDetailView(drug: drug)
                .presentationDetents([.large])
        }
        .sheet(item: $selectedCode) { code in
            CodeDetailView(code: code)
                .presentationDetents([.medium, .large])
        }
        .onAppear { isFocused = true }
    }

    // MARK: - Search bar

    private var searchBar: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .foregroundStyle(.secondary)
            TextField("Procedimientos, fármacos, códigos…", text: $searchText)
                .font(.samurBody)
                .focused($isFocused)
                .autocorrectionDisabled()
                .submitLabel(.search)
            if !searchText.isEmpty {
                Button { searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(.secondary)
                }
            }
            Button("Cancelar") { dismiss() }
                .font(.samurBody)
                .foregroundStyle(Color.samurPrimary)
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
    }

    // MARK: - Results

    @ViewBuilder
    private var resultsList: some View {
        if searchText.count < 2 {
            promptView
        } else if !hasResults {
            ContentUnavailableView.search(text: searchText)
        } else {
            List {
                if !matchedProcedures.isEmpty {
                    Section("Procedimientos") {
                        ForEach(matchedProcedures) { procedure in
                            NavigationLink(value: procedure) {
                                procedureRow(procedure)
                            }
                        }
                    }
                }
                if !matchedDrugs.isEmpty {
                    Section("Fármacos") {
                        ForEach(matchedDrugs) { drug in
                            drugRow(drug)
                                .contentShape(Rectangle())
                                .onTapGesture { selectedDrug = drug }
                        }
                    }
                }
                if !matchedCodes.isEmpty {
                    Section("Códigos") {
                        ForEach(matchedCodes) { code in
                            codeRow(code)
                                .contentShape(Rectangle())
                                .onTapGesture { selectedCode = code }
                        }
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationDestination(for: Procedure.self) { procedure in
                ProcedureDetailView(procedure: procedure)
            }
        }
    }

    private var promptView: some View {
        VStack(spacing: 14) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 36))
                .foregroundStyle(.tertiary)
                .symbolRenderingMode(.hierarchical)
            Text("Escribe al menos 2 caracteres")
                .font(.samurSubheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Row helpers

    private func procedureRow(_ procedure: Procedure) -> some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 3)
                .fill(procedure.color)
                .frame(width: 3, height: 38)
            VStack(alignment: .leading, spacing: 3) {
                Text(procedure.title)
                    .font(.samurBody)
                    .lineLimit(2)
                HStack(spacing: 6) {
                    Text(procedure.id)
                        .font(.samurMono)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 1)
                        .background(.secondary.opacity(0.1), in: RoundedRectangle(cornerRadius: 4))
                    SectionBadge(label: procedure.sectionDisplayName, color: procedure.color)
                }
            }
        }
        .padding(.vertical, 2)
    }

    private func drugRow(_ drug: Drug) -> some View {
        HStack(spacing: 10) {
            Circle()
                .fill(drug.categoryColor)
                .frame(width: 8, height: 8)
            VStack(alignment: .leading, spacing: 2) {
                Text(drug.name)
                    .font(.samurBody)
                Text(drug.category)
                    .font(.samurCaption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }

    private func codeRow(_ code: Code) -> some View {
        HStack(spacing: 10) {
            Text(code.code)
                .font(.samurMonoBody)
                .foregroundStyle(.white)
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(Color.samurPrimary, in: RoundedRectangle(cornerRadius: 6))
                .fixedSize()

            VStack(alignment: .leading, spacing: 2) {
                Text(code.name)
                    .font(.samurBody)
                Text(codigoTypeLabels[code.type] ?? code.type)
                    .font(.samurCaption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 2)
    }
}
