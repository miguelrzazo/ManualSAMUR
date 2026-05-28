import SwiftUI
import MarkdownUI

// MARK: - TOC Entry

struct TOCEntry: Identifiable {
    let id: Int       // index in contentSegments array
    let level: Int    // 1, 2, or 3
    let text: String
}

// MARK: - ProcedureDetailView

struct ProcedureDetailView: View {
    let procedure: Procedure
    @Environment(DataStore.self) private var store

    @State private var isFavorite = false
    @State private var showScrollToTop = false
    @State private var showTOC = false
    @State private var showAnnexes = false

    private let favoritesKey = "favorites"

    // MARK: - Content processing

    private var processedContent: String {
        procedure.content.replacingOccurrences(
            of: "](/images/",
            with: "](https://manual-samur.vercel.app/images/"
        )
    }

    private var contentSegments: [String] {
        var segments: [String] = []
        var current = ""
        for line in processedContent.components(separatedBy: "\n") {
            if line.hasPrefix("#") && !current.isEmpty {
                segments.append(current)
                current = line
            } else {
                current += (current.isEmpty ? "" : "\n") + line
            }
        }
        if !current.isEmpty { segments.append(current) }
        return segments.isEmpty ? [processedContent] : segments
    }

    private var tocEntries: [TOCEntry] {
        contentSegments.enumerated().compactMap { index, segment in
            let firstLine = segment.components(separatedBy: "\n").first ?? ""
            guard firstLine.hasPrefix("#") else { return nil }
            let level = firstLine.prefix(while: { $0 == "#" }).count
            let text = firstLine.drop(while: { $0 == "#" || $0 == " " })
            return TOCEntry(id: index, level: min(level, 3), text: String(text))
        }
    }

    // MARK: - Prev / Next

    private var procedureIndex: Int? {
        store.procedures.firstIndex(where: { $0.id == procedure.id })
    }

    private var prevProcedure: Procedure? {
        guard let idx = procedureIndex, idx > 0 else { return nil }
        return store.procedures[idx - 1]
    }

    private var nextProcedure: Procedure? {
        guard let idx = procedureIndex, idx < store.procedures.count - 1 else { return nil }
        return store.procedures[idx + 1]
    }

    // MARK: - Body

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    // Header card
                    header
                        .padding(.horizontal)
                        .padding(.top)

                    // Top anchor for back-to-top detection
                    Color.clear
                        .frame(height: 1)
                        .id("top")
                        .onAppear { showScrollToTop = false }
                        .onDisappear { showScrollToTop = true }

                    // Segmented markdown with anchors
                    ForEach(Array(contentSegments.enumerated()), id: \.offset) { index, segment in
                        Markdown(segment)
                            .markdownTheme(.gitHub)
                            .padding(.horizontal)
                            .id("segment-\(index)")
                    }
                    .padding(.top, 16)

                    // Prev / Next navigation
                    prevNextBar

                    Spacer(minLength: 32)
                }
            }
            .overlay(alignment: .bottomTrailing) {
                if showScrollToTop {
                    Button {
                        HapticFeedback.rigid()
                        withAnimation { proxy.scrollTo("top", anchor: .top) }
                    } label: {
                        Image(systemName: "arrow.up.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.white, Color.samurBlue)
                    }
                    .padding(16)
                    .transition(.opacity.combined(with: .scale))
                }
            }
            .animation(.easeInOut(duration: 0.2), value: showScrollToTop)
            .sheet(isPresented: $showTOC) {
                TOCSheet(entries: tocEntries) { segmentIndex in
                    withAnimation {
                        proxy.scrollTo("segment-\(segmentIndex)", anchor: .top)
                    }
                }
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
                        .symbolEffect(.bounce, value: isFavorite)
                }
            }
            if !tocEntries.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showTOC = true } label: {
                        Image(systemName: "list.bullet")
                    }
                }
            }
            if let attachments = store.attachmentsByProcedure[procedure.id], !attachments.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showAnnexes = true } label: {
                        Image(systemName: "paperclip")
                    }
                }
            }
        }
        .sheet(isPresented: $showAnnexes) {
            if let attachments = store.attachmentsByProcedure[procedure.id] {
                ProcedureAnnexesView(attachments: attachments)
            }
        }
        .onAppear { isFavorite = loadFavorites().contains(procedure.id) }
    }

    // MARK: - Header card

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

    // MARK: - Prev / Next bar

    private var prevNextBar: some View {
        HStack {
            if let prev = prevProcedure {
                NavigationLink(value: prev) {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left").font(.caption)
                        Text(prev.id).font(.subheadline)
                    }
                }
                .simultaneousGesture(TapGesture().onEnded { HapticFeedback.light() })
            }
            Spacer()
            if let next = nextProcedure {
                NavigationLink(value: next) {
                    HStack(spacing: 4) {
                        Text(next.id).font(.subheadline)
                        Image(systemName: "chevron.right").font(.caption)
                    }
                }
                .simultaneousGesture(TapGesture().onEnded { HapticFeedback.light() })
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
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
            HapticFeedback.light()
        } else {
            favs.insert(procedure.id)
            isFavorite = true
            HapticFeedback.medium()
        }
        UserDefaults.standard.set(Array(favs), forKey: favoritesKey)
    }
}

// MARK: - TOCSheet

struct TOCSheet: View {
    let entries: [TOCEntry]
    let onSelect: (Int) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(entries) { entry in
                Button {
                    onSelect(entry.id)
                    dismiss()
                } label: {
                    HStack(spacing: 0) {
                        if entry.level >= 2 {
                            Spacer().frame(width: CGFloat(entry.level - 1) * 16)
                        }
                        Text(entry.text)
                            .font(entry.level == 1 ? .body.weight(.semibold) : .body)
                    }
                }
                .foregroundStyle(.primary)
            }
            .listStyle(.plain)
            .navigationTitle("Contenido")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
    }
}
