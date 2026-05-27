import SwiftUI

struct CodigosView: View {
    @Environment(DataStore.self) private var store
    @State private var selectedType = "incidente"
    @State private var searchText = ""
    @State private var selectedCode: Code?

    private var availableTypes: [String] {
        codigoTypeOrder.filter { store.codes[$0] != nil && !(store.codes[$0]?.isEmpty ?? true) }
    }

    private var filteredCodes: [Code] {
        let all = store.codes(for: selectedType)
        guard !searchText.isEmpty else { return all }
        return all.filter { $0.matches(searchText) }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Type picker — scrollable chips
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(availableTypes, id: \.self) { type in
                        Button {
                            selectedType = type
                            searchText = ""
                        } label: {
                            Text(codigoTypeLabels[type] ?? type)
                                .font(.subheadline.weight(selectedType == type ? .semibold : .regular))
                                .padding(.horizontal, 14)
                                .padding(.vertical, 7)
                                .background(
                                    selectedType == type ? Color.samurBlue : Color.secondary.opacity(0.12),
                                    in: Capsule()
                                )
                                .foregroundStyle(selectedType == type ? .white : .primary)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical, 10)
            }
            Divider()

            // Code list
            if filteredCodes.isEmpty && !searchText.isEmpty {
                EmptySearchView(query: searchText)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                List(filteredCodes) { code in
                    CodeRow(code: code)
                        .contentShape(Rectangle())
                        .onTapGesture { selectedCode = code }
                }
                .listStyle(.plain)
            }
        }
        .navigationTitle("Códigos")
        .searchable(text: $searchText, prompt: "Buscar código…")
        .sheet(item: $selectedCode) { code in
            CodeDetailView(code: code)
                .presentationDetents([.medium, .large])
        }
    }
}

// MARK: - Row

private struct CodeRow: View {
    let code: Code

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(code.code)
                    .font(.caption.monospaced().weight(.semibold))
                    .foregroundStyle(Color.samurBlue)
                Spacer()
                if let category = code.category {
                    Text(category)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            Text(code.name)
                .font(.body)
        }
        .padding(.vertical, 2)
    }
}
