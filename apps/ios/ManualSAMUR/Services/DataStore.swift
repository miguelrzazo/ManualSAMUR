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
    var bases: [Base] = []
    var status4: [Status4Entry] = []
    var perfusiones: [Perfusion] = []
    var fluidos: [Fluid] = []
    var comerciales: [CommercialDrug] = []
    var cheatsheetSections: [CheatsheetSection] = []
    var attachmentsByProcedure: [String: [PDFAttachment]] = [:]
    var loadingState: LoadingState = .idle

    var updateEvents: [ManualUpdateEvent] = []
    var recents: [String] = []
    private(set) var seenEventIds: Set<String> = []

    private let lastUpdatedKey = "ios_data_last_updated"
    private let recentsKey = "ios_recent_procedure_ids"
    private let seenEventsKey = "ios_seen_event_ids"

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

        // 3. Load stable reference data once from bundle (not part of AppData / cache cycle)
        if let cheatsheet = try? DataService.loadBundledCheatsheet() {
            cheatsheetSections = cheatsheet
        }
        if let classification = try? DataService.loadBundledPDFClassification() {
            attachmentsByProcedure = Dictionary(grouping: classification.pdfs, by: \.procedureId)
        }

        // 4. Load persisted recents
        recents = UserDefaults.standard.stringArray(forKey: recentsKey) ?? []
        seenEventIds = Set(UserDefaults.standard.stringArray(forKey: seenEventsKey) ?? [])

        // 5. Load cached update events (non-blocking, refresh in background)
        if DataService.hasCachedUpdateEvents,
           let cached = try? DataService.loadCachedUpdateEvents() {
            updateEvents = cached.events
        }

        // 6. Background sync from network
        await refresh()
        Task { await refreshUpdateEvents() }
    }

    @MainActor
    func refreshUpdateEvents() async {
        guard let payload = try? await DataService.fetchUpdateEvents() else { return }
        updateEvents = payload.events
        try? DataService.saveUpdateEventsCache(payload)
    }

    @MainActor
    func refresh() async {
        guard loadingState != .loading else { return }

        let manifest = try? await DataService.fetchManifest()
        if let manifest {
            let stored = UserDefaults.standard.string(forKey: lastUpdatedKey) ?? ""
            guard manifest.lastUpdated != stored || !DataService.hasCachedData else { return }
        }

        loadingState = .loading
        do {
            let data = try await DataService.fetchAll()
            apply(data)
            try? DataService.saveCache(data)
            if let manifest {
                UserDefaults.standard.set(manifest.lastUpdated, forKey: lastUpdatedKey)
            }
            loadingState = .ready
        } catch {
            loadingState = loadingState == .ready ? .ready : .error(error.localizedDescription)
        }
    }

    private func apply(_ data: AppData) {
        procedures  = data.procedures
        drugs       = data.drugs
        codes       = data.codes
        hospitals   = data.hospitals
        bases       = data.bases
        status4     = data.status4
        perfusiones = data.perfusiones
        fluidos     = data.fluidos
        comerciales = data.comerciales
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

    var drugsSortedAlphabetically: [(letter: String, items: [Drug])] {
        let sorted = drugs.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        var grouped: [String: [Drug]] = [:]
        for drug in sorted {
            let letter = String(drug.name.prefix(1)).uppercased()
            grouped[letter, default: []].append(drug)
        }
        return grouped.sorted { $0.key < $1.key }.map { (letter: $0.key, items: $0.value) }
    }

    var drugById: [String: Drug] {
        Dictionary(uniqueKeysWithValues: drugs.map { ($0.id, $0) })
    }

    var perfusionesByCategory: [(category: String, items: [Perfusion])] {
        var grouped: [String: [Perfusion]] = [:]
        var orderedKeys: [String] = []
        var seen = Set<String>()
        for p in perfusiones {
            if seen.insert(p.category).inserted { orderedKeys.append(p.category) }
            grouped[p.category, default: []].append(p)
        }
        return orderedKeys.map { key in (category: key, items: grouped[key]!) }
    }

    var comercialesSortedAlphabetically: [(letter: String, items: [CommercialDrug])] {
        let sorted = comerciales.sorted {
            $0.activeIngredient.localizedCompare($1.activeIngredient) == .orderedAscending
        }
        var grouped: [String: [CommercialDrug]] = [:]
        var orderedKeys: [String] = []
        var seen = Set<String>()
        for c in sorted {
            let letter = String(c.activeIngredient.prefix(1)).uppercased()
            if seen.insert(letter).inserted { orderedKeys.append(letter) }
            grouped[letter, default: []].append(c)
        }
        return orderedKeys.sorted { $0.localizedCompare($1) == .orderedAscending }
            .map { key in (letter: key, items: grouped[key]!) }
    }

    func codes(for type: String) -> [Code] {
        codes[type] ?? []
    }

    // MARK: - Recents

    func recordRecent(_ id: String) {
        var updated = recents.filter { $0 != id }
        updated.insert(id, at: 0)
        if updated.count > 15 { updated = Array(updated.prefix(15)) }
        recents = updated
        UserDefaults.standard.set(updated, forKey: recentsKey)
    }

    var recentProcedures: [Procedure] {
        recents.compactMap { id in procedures.first { $0.id == id } }
    }

    // MARK: - Favorites

    var favoriteProcedureIds: [String] {
        UserDefaults.standard.stringArray(forKey: "favorites") ?? []
    }

    var favoriteProcedures: [Procedure] {
        favoriteProcedureIds.compactMap { id in procedures.first { $0.id == id } }
    }

    // MARK: - Update events / Historial

    var unseenEventCount: Int {
        updateEvents.filter { $0.isNewThisWeek && !seenEventIds.contains($0.eventId) }.count
    }

    var hasNewsThisWeek: Bool {
        updateEvents.contains { $0.isNewThisWeek }
    }

    func markAllNewEventsSeen() {
        var seen = seenEventIds
        for event in updateEvents where event.isNewThisWeek { seen.insert(event.eventId) }
        let knownIds = Set(updateEvents.map(\.eventId))
        seen = seen.filter { knownIds.contains($0) }
        seenEventIds = seen
        UserDefaults.standard.set(Array(seen), forKey: seenEventsKey)
    }

    // MARK: - Procedure sections for home grid

    var procedureSections: [ProcedureSection] {
        let order = ["sva","svb","operativos","administrativos","comunicaciones","tecnicas","psicologicos","drp","intervinientes","general"]
        var grouped: [String: [Procedure]] = [:]
        for p in procedures { grouped[p.section, default: []].append(p) }
        return order.compactMap { key in
            guard let items = grouped[key], !items.isEmpty else { return nil }
            let first = items.first!
            return ProcedureSection(
                section: key,
                displayName: first.sectionDisplayName,
                colorHex: first.sectionColor,
                procedures: items
            )
        }
    }
}
