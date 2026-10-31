import Foundation

/// Keeps the last good `WatchContent` in Application Support.
///
/// Writes go to a temporary file in the same directory and are swapped in with
/// `replaceItemAt`, so a crash or a full disk mid-write leaves the previous copy intact.
/// Nothing here ever deletes the stored copy.
struct ContentPersistence: Sendable {
    let fileURL: URL

    init(fileURL: URL = ContentPersistence.defaultURL) {
        self.fileURL = fileURL
    }

    static var defaultURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appending(path: "content", directoryHint: .isDirectory)
            .appending(path: "watch-content.json")
    }

    func load() -> WatchContent? {
        guard let data = try? Data(contentsOf: fileURL),
              let content = try? JSONDecoder().decode(WatchContent.self, from: data),
              content.formatVersion == WatchContent.formatVersion
        else { return nil }
        return content
    }

    func save(_ content: WatchContent) throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(content)
        let staging = directory.appending(path: "watch-content.\(UUID().uuidString).tmp")
        try data.write(to: staging, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        if FileManager.default.fileExists(atPath: fileURL.path()) {
            _ = try FileManager.default.replaceItemAt(fileURL, withItemAt: staging)
        } else {
            try FileManager.default.moveItem(at: staging, to: fileURL)
        }
    }

    /// The read-only copy bundled with the app for the very first, offline launch.
    /// Generated from `content/data` at `expo prebuild` by plugins/with-watch-companion.js.
    static func loadSeed(bundle: Bundle = .main) -> WatchContent? {
        guard let url = bundle.url(forResource: "watch-seed", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let envelope = try? JSONDecoder().decode(ContentEnvelope.self, from: data)
        else { return nil }
        return try? WatchContent(envelope: envelope, origin: .seed, receivedAt: .distantPast)
    }
}
