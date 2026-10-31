import Foundation
import Observation

/// Single source of truth for the UI. Starts from the stored copy (or the bundled seed),
/// then tries the network; the iPhone can push a copy at any time through
/// `PhoneContentReceiver`. A failed refresh never clears what is already shown.
@MainActor
@Observable
final class ContentStore {
    private(set) var content: WatchContent?
    private(set) var isRefreshing = false
    private(set) var lastError: String?
    private(set) var lastSuccessfulCheck: Date?

    @ObservationIgnored private let source: ContentSource
    @ObservationIgnored private let persistence: ContentPersistence
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored var onRefreshFailed: (() -> Void)?

    private static let lastCheckKey = "lastSuccessfulContentCheck"
    /// How stale the last successful check may be before an automatic refresh on foreground.
    static let automaticRefreshInterval: TimeInterval = 6 * 60 * 60

    init(source: ContentSource, persistence: ContentPersistence = ContentPersistence(), defaults: UserDefaults = .standard) {
        self.source = source
        self.persistence = persistence
        self.defaults = defaults
        content = persistence.load() ?? ContentPersistence.loadSeed()
        lastSuccessfulCheck = defaults.object(forKey: Self.lastCheckKey) as? Date
    }

    var needsAutomaticRefresh: Bool {
        guard let lastSuccessfulCheck else { return true }
        return Date.now.timeIntervalSince(lastSuccessfulCheck) > Self.automaticRefreshInterval
    }

    func refreshIfStale() async {
        if needsAutomaticRefresh { await refresh() }
    }

    func refresh() async {
        guard !isRefreshing else { return }
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            let outcome = try await source.fetch(currentHash: content?.hash)
            if case .updated(let fresh) = outcome {
                try await persist(fresh)
                content = fresh
            }
            lastError = nil
            lastSuccessfulCheck = .now
            defaults.set(lastSuccessfulCheck, forKey: Self.lastCheckKey)
        } catch {
            lastError = Self.describe(error)
            onRefreshFailed?()
        }
    }

    /// Content pushed by the iPhone. Accepted when the Watch has nothing better: no copy,
    /// only the bundled seed, or an older publication than the one received.
    @discardableResult
    func acceptFromPhone(_ incoming: WatchContent) async -> Bool {
        if let current = content, current.origin != .seed {
            guard incoming.hash != current.hash else { return false }
            if let new = incoming.publishedDate, let old = current.publishedDate, new < old { return false }
        }
        do {
            try await persist(incoming)
            content = incoming
            lastError = nil
            return true
        } catch {
            lastError = Self.describe(error)
            return false
        }
    }

    private func persist(_ content: WatchContent) async throws {
        let persistence = persistence
        try await Task.detached(priority: .utility) {
            try persistence.save(content)
        }.value
    }

    private static func describe(_ error: Error) -> String {
        if let urlError = error as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .timedOut, .dataNotAllowed:
                return "Sin conexión. Se muestran los datos guardados."
            default:
                return "No se pudo actualizar (\(urlError.code.rawValue))."
            }
        }
        if let contentError = error as? LocalizedError, let description = contentError.errorDescription {
            return description
        }
        return "No se pudo actualizar."
    }
}

extension String {
    /// Lowercased, accent-free form used for matching ("Adrenalina" ~ "adrenalína").
    var searchKey: String {
        folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: Locale(identifier: "es_ES"))
    }
}
