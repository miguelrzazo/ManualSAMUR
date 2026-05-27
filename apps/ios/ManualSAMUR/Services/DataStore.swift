import Foundation
import Observation

enum LoadingState: Equatable {
    case idle
    case loading
    case ready
    case error(String)
}

@Observable
final class DataStore {
    var procedures: [Procedure] = []
    var drugs: [Drug] = []
    var codes: [String: [Code]] = [:]
    var hospitals: [Hospital] = []
    var loadingState: LoadingState = .idle

    private let lastUpdatedKey = "ios_data_last_updated"

    @MainActor
    func load() async {
        // 1. Try Documents cache (fastest, most up-to-date local copy)
        if DataService.hasCachedData, let cached = try? DataService.loadCached() {
            apply(cached)
            loadingState = .ready
        }
        // 2. Fall back to bundled data (always available, no network needed)
        else if DataService.hasBundledData, let bundled = try? DataService.loadBundled() {
            apply(bundled)
            loadingState = .ready
        }

        // 3. Background sync from network
        await refresh()
    }

    @MainActor
    func refresh() async {
        guard loadingState != .loading else { return }

        // Check manifest to see if update is needed
        if let manifest = try? await DataService.fetchManifest() {
            let stored = UserDefaults.standard.string(forKey: lastUpdatedKey) ?? ""
            guard manifest.lastUpdated != stored || !DataService.hasCachedData else { return }
        }

        loadingState = .loading
        do {
            let data = try await DataService.fetchAll()
            apply(data)
            try? DataService.saveCache(data)
            if let manifest = try? await DataService.fetchManifest() {
                UserDefaults.standard.set(manifest.lastUpdated, forKey: lastUpdatedKey)
            }
            loadingState = .ready
        } catch {
            if loadingState != .ready {
                loadingState = .error(error.localizedDescription)
            } else {
                loadingState = .ready
            }
        }
    }

    private func apply(_ data: AppData) {
        procedures = data.procedures
        drugs = data.drugs
        codes = data.codes
        hospitals = data.hospitals
    }

    // Grouped accessors
    var proceduresBySection: [(section: String, items: [Procedure])] {
        let order = ["sva","svb","operativos","administrativos","comunicaciones","tecnicas","psicologicos","drp","intervinientes","general"]
        var grouped: [String: [Procedure]] = [:]
        for p in procedures { grouped[p.section, default: []].append(p) }
        return order.compactMap { key in
            guard let items = grouped[key], !items.isEmpty else { return nil }
            return (section: key, items: items)
        }
    }

    var drugsByCategory: [(category: String, items: [Drug])] {
        var grouped: [String: [Drug]] = [:]
        for d in drugs { grouped[d.category, default: []].append(d) }
        return grouped.sorted { $0.key < $1.key }.map { (category: $0.key, items: $0.value) }
    }

    func codes(for type: String) -> [Code] {
        codes[type] ?? []
    }
}
