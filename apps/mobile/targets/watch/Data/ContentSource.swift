import Foundation

enum ContentFetchOutcome: Sendable {
    /// The copy on the Watch is already the active publication.
    case upToDate
    case updated(WatchContent)
}

/// Where the Watch gets fresh content from. Kept behind a protocol so the backend
/// contract (still evolving) can change without touching the store or the UI.
protocol ContentSource: Sendable {
    func fetch(currentHash: String?) async throws -> ContentFetchOutcome
}

/// Small manifest published by the backend: `GET /api/mobile/content/metadata`.
/// Only `hash` is required; everything else is optional so a richer manifest
/// endpoint can replace it without breaking older Watch builds.
struct ContentManifest: Decodable, Sendable {
    let schema: String?
    let version: Int?
    let hash: String
    let generatedAt: String?
    let releaseId: String?
    let contentUrl: String?
}

/// Reads the public Cloudflare backend.
///
/// 1. `GET <origin>/api/mobile/content/metadata` (a few hundred bytes). If its `hash`
///    equals the stored copy, stop: nothing is downloaded.
/// 2. Otherwise download the snapshot from the manifest's `contentUrl` (immutable,
///    cacheable per release) or, failing that, `/api/mobile/content/v3`, sending
///    `If-None-Match` with the stored hash so a 304 also counts as up to date.
/// 3. Decode, check the schema and that the snapshot's hash equals the manifest's,
///    and only then hand it back. Any failure throws and the caller keeps its copy.
struct CloudflareContentSource: ContentSource {
    static let productionOrigin = URL(string: "https://manualsamur.miguelrzazo13.workers.dev")!

    let origin: URL
    let session: URLSession

    init(origin: URL = CloudflareContentSource.productionOrigin, session: URLSession = .watchContent) {
        self.origin = origin
        self.session = session
    }

    func fetch(currentHash: String?) async throws -> ContentFetchOutcome {
        let manifest = try? await fetchManifest()
        if let manifest, manifest.hash == currentHash {
            return .upToDate
        }

        var contentURL = origin.appending(path: "api/mobile/content/v3")
        if let path = manifest?.contentUrl, let resolved = URL(string: path, relativeTo: origin) {
            contentURL = resolved.absoluteURL
        }

        var request = URLRequest(url: contentURL)
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let currentHash {
            request.setValue("\"\(currentHash)\"", forHTTPHeaderField: "If-None-Match")
        }
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 304 { return .upToDate }
        guard (200..<300).contains(status) else { throw ContentError.badStatus(status) }

        let envelope = try JSONDecoder().decode(ContentEnvelope.self, from: data)
        if let manifest, manifest.hash != envelope.hash {
            throw ContentError.hashMismatch
        }
        if envelope.hash == currentHash { return .upToDate }
        return .updated(try WatchContent(envelope: envelope, origin: .network))
    }

    private func fetchManifest() async throws -> ContentManifest {
        var request = URLRequest(url: origin.appending(path: "api/mobile/content/metadata"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw ContentError.badStatus(status) }
        return try JSONDecoder().decode(ContentManifest.self, from: data)
    }
}

extension URLSession {
    static let watchContent: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.timeoutIntervalForRequest = 20
        configuration.timeoutIntervalForResource = 120
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }()
}
