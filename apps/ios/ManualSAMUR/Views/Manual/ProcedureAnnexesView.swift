import SwiftUI
import QuickLook

struct ProcedureAnnexesView: View {
    let attachments: [PDFAttachment]
    @State private var downloadingId: String? = nil
    @State private var previewURL: URL? = nil
    @State private var errorMessage: String? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List(attachments) { attachment in
                HStack {
                    Image(systemName: "doc.fill")
                        .foregroundStyle(Color.samurBlue)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(attachment.filename)
                            .font(.body)
                            .lineLimit(2)
                    }
                    Spacer()
                    if downloadingId == attachment.id {
                        ProgressView().scaleEffect(0.8)
                    } else {
                        Image(systemName: "arrow.down.circle")
                            .foregroundStyle(Color.samurBlue)
                    }
                }
                .contentShape(Rectangle())
                .onTapGesture {
                    openOrDownload(attachment)
                }
            }
            .listStyle(.plain)
            .navigationTitle("Anexos")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
            .alert("Error", isPresented: Binding(
                get: { errorMessage != nil },
                set: { if !$0 { errorMessage = nil } }
            )) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
        .quickLookPreview($previewURL)
    }

    private var cacheDir: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("pdf_cache", isDirectory: true)
    }

    private func cachedURL(for attachment: PDFAttachment) -> URL {
        cacheDir.appendingPathComponent(attachment.filename)
    }

    private func openOrDownload(_ attachment: PDFAttachment) {
        let cached = cachedURL(for: attachment)
        if FileManager.default.fileExists(atPath: cached.path) {
            previewURL = cached
            return
        }
        guard let remote = attachment.remoteURL else {
            errorMessage = "URL no disponible"
            return
        }
        downloadingId = attachment.id
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: remote)
                try FileManager.default.createDirectory(at: cacheDir, withIntermediateDirectories: true)
                try data.write(to: cached)
                await MainActor.run {
                    downloadingId = nil
                    previewURL = cached
                }
            } catch {
                await MainActor.run {
                    downloadingId = nil
                    errorMessage = "No se pudo descargar: \(error.localizedDescription)"
                }
            }
        }
    }
}
