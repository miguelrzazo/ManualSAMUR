import SwiftUI
import MarkdownUI

struct ProcedureDetailView: View {
    let procedure: Procedure
    @State private var isFavorite = false

    private let favoritesKey = "favorites"

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                // Header card
                header
                    .padding(.horizontal)
                    .padding(.top)

                // Markdown body
                Markdown(procedure.content)
                    .markdownTheme(.gitHub)
                    .padding(.horizontal)
                    .padding(.top, 16)
                    .padding(.bottom, 32)
            }
        }
        .navigationTitle(procedure.id)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    toggleFavorite()
                } label: {
                    Image(systemName: isFavorite ? "heart.fill" : "heart")
                        .foregroundStyle(isFavorite ? .red : .secondary)
                }
            }
        }
        .onAppear { isFavorite = loadFavorites().contains(procedure.id) }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionBadge(label: procedure.sectionDisplayName, color: procedure.color)

            Text(procedure.title)
                .font(.title2.weight(.semibold))

            if let updated = procedure.updated {
                Label("Actualizado: \(updated)", systemImage: "calendar")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .samurCard()
    }

    // MARK: - Favorites persistence

    private func loadFavorites() -> Set<String> {
        let arr = UserDefaults.standard.stringArray(forKey: favoritesKey) ?? []
        return Set(arr)
    }

    private func toggleFavorite() {
        var favs = loadFavorites()
        if favs.contains(procedure.id) {
            favs.remove(procedure.id)
            isFavorite = false
        } else {
            favs.insert(procedure.id)
            isFavorite = true
        }
        UserDefaults.standard.set(Array(favs), forKey: favoritesKey)
    }
}

