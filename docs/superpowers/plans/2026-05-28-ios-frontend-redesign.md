# iOS Frontend Redesign — Minimal Clinical Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the iOS app's visual system from glass-morphism to Minimal Clinical — list rows with color bars, underline tab pickers, animated ticker ribbon, inline diff historial, and comprehensive haptic feedback throughout.

**Architecture:** View-by-view from highest impact first (Manual home → Códigos/Vademécum → shared polish). Shared design tokens land in Task 1 and every subsequent task builds on them. No external dependencies added.

**Tech Stack:** SwiftUI, @Observable DataStore, Instrument Sans custom font, SF Symbols, UIKit haptics via HapticFeedback enum.

---

## Task 1: Design System Tokens + DataStore Reactivity

**Files:**
- Create: `apps/ios/ManualSAMUR/Views/Shared/DesignSystem.swift`
- Modify: `apps/ios/ManualSAMUR/Views/Shared/TypographyExtension.swift`
- Modify: `apps/ios/ManualSAMUR/Services/DataStore.swift`

- [ ] **Step 1: Create DesignSystem.swift**

```swift
// apps/ios/ManualSAMUR/Views/Shared/DesignSystem.swift
import SwiftUI

enum Spacing {
    static let xs: CGFloat = 4
    static let sm: CGFloat = 8
    static let md: CGFloat = 12
    static let lg: CGFloat = 16
    static let xl: CGFloat = 24
}

enum Radius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 10
    static let lg: CGFloat = 14
}

extension View {
    func cardShadow() -> some View {
        self
            .shadow(color: .black.opacity(0.06), radius: 2, y: 1)
            .shadow(color: .black.opacity(0.04), radius: 8, y: 3)
    }
}
```

Add the file to the Xcode project: open Xcode, right-click `Views/Shared` group → Add Files to 'ManualSAMUR', select the new file.

- [ ] **Step 2: Add `.samurLabel` to TypographyExtension.swift**

After the `samurCaption2` line (line 29), add:

```swift
    static let samurCaption2    = instrument(11, weight: .regular)

    /// Uppercase section header label — 10pt, bold, 0.5pt tracking
    static let samurLabel       = instrument(10, weight: .bold)
```

- [ ] **Step 3: Make `unseenEventCount` reactive in DataStore**

`unseenEventCount` currently reads UserDefaults directly on every call, which means @Observable cannot track it. Add a stored property so SwiftUI re-renders when it changes.

In `DataStore.swift`, add a stored property after `var recents: [String] = []` (line 28):

```swift
    var recents: [String] = []
    private(set) var seenEventIds: Set<String> = []
```

In the `load()` method, after the `recents` line (line 55), add:

```swift
        recents = UserDefaults.standard.stringArray(forKey: recentsKey) ?? []
        seenEventIds = Set(UserDefaults.standard.stringArray(forKey: seenEventsKey) ?? [])
```

Replace the `unseenEventCount` computed property (lines 199–202):

```swift
    var unseenEventCount: Int {
        updateEvents.filter { $0.isNewThisWeek && !seenEventIds.contains($0.eventId) }.count
    }
```

Replace `markAllNewEventsSeen()` (lines 208–215):

```swift
    func markAllNewEventsSeen() {
        var seen = seenEventIds
        for event in updateEvents where event.isNewThisWeek { seen.insert(event.eventId) }
        let knownIds = Set(updateEvents.map(\.eventId))
        seen = seen.filter { knownIds.contains($0) }
        seenEventIds = seen
        UserDefaults.standard.set(Array(seen), forKey: seenEventsKey)
    }
```

- [ ] **Step 4: Build**

Open Xcode → Product → Build (⌘B). Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Shared/DesignSystem.swift" \
        "apps/ios/ManualSAMUR/Views/Shared/TypographyExtension.swift" \
        "apps/ios/ManualSAMUR/Services/DataStore.swift" \
        "apps/ios/ManualSAMUR.xcodeproj/project.pbxproj"
git commit -m "feat(ios/design): add DesignSystem tokens, samurLabel, reactive unseenEventCount"
```

---

## Task 2: ProcedureListRow + SectionGroup Shared Components

**Files:**
- Create: `apps/ios/ManualSAMUR/Views/Shared/ProcedureListRow.swift`
- Create: `apps/ios/ManualSAMUR/Views/Shared/SectionGroup.swift`

- [ ] **Step 1: Create ProcedureListRow.swift**

This is the core list row used in Recientes, Favoritos, Secciones, and search results.

```swift
// apps/ios/ManualSAMUR/Views/Shared/ProcedureListRow.swift
import SwiftUI

/// Standard list row with a 3pt color left-bar.
/// Use inside a grouped card (SectionGroup) for the full look.
struct ProcedureListRow<Trailing: View>: View {
    let color: Color
    let title: String
    var subtitle: String? = nil
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 0) {
            Rectangle()
                .fill(color)
                .frame(width: 3)

            HStack(spacing: Spacing.sm) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.samurSubheadline)
                        .foregroundStyle(.primary)
                        .lineLimit(2)
                    if let subtitle {
                        Text(subtitle)
                            .font(.samurFootnote)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: Spacing.sm)
                trailing()
            }
            .padding(.horizontal, Spacing.md)
            .padding(.vertical, Spacing.sm + 2)
        }
        .frame(minHeight: 44)
        .background(Color(.secondarySystemGroupedBackground))
    }
}

// MARK: - Convenience initialisers

extension ProcedureListRow where Trailing == Image {
    /// Row with a chevron (navigation rows).
    init(color: Color, title: String, subtitle: String? = nil) {
        self.color = color
        self.title = title
        self.subtitle = subtitle
        self.trailing = {
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color(.tertiaryLabel))
        }
    }
}

extension ProcedureListRow where Trailing == EmptyView {
    /// Row with no trailing element.
    init(color: Color, title: String, subtitle: String? = nil, noTrailing: Bool = true) {
        self.color = color
        self.title = title
        self.subtitle = subtitle
        self.trailing = { EmptyView() }
    }
}
```

Add the file to the Xcode project target.

- [ ] **Step 2: Create SectionGroup.swift**

Wraps a list of rows inside a rounded card with a section label header.

```swift
// apps/ios/ManualSAMUR/Views/Shared/SectionGroup.swift
import SwiftUI

/// Rounded card container that groups list rows under an uppercase label header.
struct SectionGroup<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: Spacing.xs) {
            Text(title)
                .font(.samurLabel)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)
                .tracking(0.5)
                .padding(.leading, Spacing.xs)

            VStack(spacing: 0) {
                content()
            }
            .clipShape(RoundedRectangle(cornerRadius: Radius.md))
            .cardShadow()
        }
    }
}
```

Add the file to the Xcode project target.

- [ ] **Step 3: Build**

⌘B. Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Shared/ProcedureListRow.swift" \
        "apps/ios/ManualSAMUR/Views/Shared/SectionGroup.swift" \
        "apps/ios/ManualSAMUR.xcodeproj/project.pbxproj"
git commit -m "feat(ios/design): add ProcedureListRow and SectionGroup shared components"
```

---

## Task 3: BreakingNewsRibbon — Extract + Ticker Animation

**Files:**
- Create: `apps/ios/ManualSAMUR/Views/Manual/BreakingNewsRibbon.swift`
- Modify: `apps/ios/ManualSAMUR/Views/Manual/ManualView.swift` (remove private struct)

- [ ] **Step 1: Create BreakingNewsRibbon.swift**

Replaces the private struct in ManualView. Adds a live scrolling ticker and a simplified solid-red background (no diagonal stripes).

```swift
// apps/ios/ManualSAMUR/Views/Manual/BreakingNewsRibbon.swift
import SwiftUI

struct BreakingNewsRibbon: View {
    let events: [ManualUpdateEvent]
    let unseenCount: Int
    let onTap: () -> Void

    private var tickerText: String {
        events.prefix(8).map(\.summary).joined(separator: "   ·   ")
    }

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: Spacing.sm + 2) {
                Image(systemName: "antenna.radiowaves.left.and.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.white)
                    .symbolEffect(.variableColor.iterative.dimInactiveLayers, options: .repeating)
                    .flexibleFrame(minWidth: 16, maxWidth: 16)

                if unseenCount > 0 {
                    Text("\(unseenCount)")
                        .font(.samurCaption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(.white.opacity(0.22), in: Capsule())
                }

                MarqueeText(text: tickerText)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.vertical, 11)
            .frame(maxWidth: .infinity)
            .background(Color(hex: "#DC2626"))
        }
        .buttonStyle(.plain)
        .onAppear { HapticFeedback.warning() }
    }
}

// MARK: - Marquee ticker

private struct MarqueeText: View {
    let text: String
    @State private var offset: CGFloat = 0
    @State private var contentWidth: CGFloat = 1

    var body: some View {
        HStack(spacing: 48) {
            tickerLabel
            tickerLabel
        }
        .fixedSize()
        .offset(x: offset)
        .background(
            GeometryReader { g in
                Color.clear.preference(key: MarqueeWidthKey.self, value: g.size.width / 2)
            }
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .clipped()
        .onPreferenceChange(MarqueeWidthKey.self) { w in
            guard w > 1, w != contentWidth else { return }
            contentWidth = w
            startAnimation(width: w)
        }
    }

    private var tickerLabel: some View {
        Text(text)
            .font(.samurCaption)
            .foregroundStyle(.white.opacity(0.9))
            .fixedSize()
    }

    private func startAnimation(width: CGFloat) {
        offset = 0
        let duration = Double(width) / 60.0
        withAnimation(.linear(duration: duration).repeatForever(autoreverses: false)) {
            offset = -(width + 48)
        }
    }
}

private struct MarqueeWidthKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
```

Add the file to the Xcode project target.

- [ ] **Step 2: Remove the private BreakingNewsRibbon struct from ManualView.swift**

Delete lines 83–152 in `ManualView.swift` (the `// MARK: - Breaking News Ribbon` section and the entire private `BreakingNewsRibbon` struct). The public `BreakingNewsRibbon` in the new file takes its place — the call site in `ManualView.body` is unchanged.

- [ ] **Step 3: Build**

⌘B. Expected: build succeeds. The ribbon still renders in the simulator identically to before but with the new code path.

- [ ] **Step 4: Verify in simulator**

Run on iPhone 15 simulator. Navigate to Manual tab. If there are unseen events the red ribbon appears and the ticker text scrolls. Tap it — `HistorialView` sheet opens (unchanged for now).

- [ ] **Step 5: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Manual/BreakingNewsRibbon.swift" \
        "apps/ios/ManualSAMUR/Views/Manual/ManualView.swift" \
        "apps/ios/ManualSAMUR.xcodeproj/project.pbxproj"
git commit -m "feat(ios/manual): extract BreakingNewsRibbon with live scrolling ticker"
```

---

## Task 4: ManualView Full Rebuild

**Files:**
- Modify: `apps/ios/ManualSAMUR/Views/Manual/ManualView.swift`

- [ ] **Step 1: Replace ManualView.swift with the new scroll layout**

Keep the existing `ProcedureRow` (used by SectionDetailView) and `ProcedurePill` (kept for now, removed after Codes/Vademecum). Replace everything else.

The new full file content:

```swift
import SwiftUI

// MARK: - ManualView (Home)

struct ManualView: View {
    @Environment(DataStore.self) private var store
    @State private var showSearch = false
    @State private var showMenu = false
    @State private var showHistorial = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Spacing.xl) {
                let recents = store.recentProcedures
                if !recents.isEmpty {
                    SectionGroup(title: "Recientes") {
                        ForEach(Array(recents.prefix(5).enumerated()), id: \.element.id) { i, procedure in
                            if i > 0 { Divider().padding(.leading, Spacing.md) }
                            NavigationLink(value: procedure) {
                                ProcedureListRow(
                                    color: procedure.color,
                                    title: procedure.title
                                )
                                .pressScale()
                            }
                            .buttonStyle(.plain)
                            .onTapGesture { HapticFeedback.light() }
                        }
                    }
                }

                let favorites = store.favoriteProcedures
                if !favorites.isEmpty {
                    SectionGroup(title: "Favoritos") {
                        ForEach(Array(favorites.enumerated()), id: \.element.id) { i, procedure in
                            if i > 0 { Divider().padding(.leading, Spacing.md) }
                            NavigationLink(value: procedure) {
                                ProcedureListRow(color: procedure.color, title: procedure.title) {
                                    Image(systemName: "star.fill")
                                        .font(.caption)
                                        .foregroundStyle(.yellow)
                                }
                                .pressScale()
                            }
                            .buttonStyle(.plain)
                            .onTapGesture { HapticFeedback.light() }
                        }
                    }
                }

                SectionGroup(title: "Secciones") {
                    ForEach(Array(store.procedureSections.enumerated()), id: \.element.id) { i, section in
                        if i > 0 { Divider().padding(.leading, Spacing.md) }
                        NavigationLink(value: section) {
                            ProcedureListRow(
                                color: Color(hex: section.colorHex),
                                title: section.displayName,
                                subtitle: "\(section.procedures.count) procedimientos"
                            )
                            .pressScale()
                        }
                        .buttonStyle(.plain)
                        .onTapGesture { HapticFeedback.light() }
                    }
                }

                // Historial button — always at bottom
                Button {
                    showHistorial = true
                    HapticFeedback.light()
                } label: {
                    HStack(spacing: Spacing.md) {
                        Image(systemName: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        Text("Historial de actualizaciones")
                            .font(.samurSubheadline)
                            .foregroundStyle(.primary)
                        Spacer()
                        if store.unseenEventCount > 0 {
                            Text("\(store.unseenEventCount)")
                                .font(.samurCaption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 3)
                                .background(Color.red, in: Capsule())
                        }
                        Image(systemName: "chevron.right")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(Color(.tertiaryLabel))
                    }
                    .padding(.horizontal, Spacing.md)
                    .padding(.vertical, Spacing.md)
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(RoundedRectangle(cornerRadius: Radius.md))
                    .cardShadow()
                    .pressScale()
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, Spacing.lg)
            .padding(.top, Spacing.md)
            .padding(.bottom, Spacing.xl)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .top, spacing: 0) {
            if store.hasNewsThisWeek && store.unseenEventCount > 0 {
                BreakingNewsRibbon(
                    events: store.updateEvents.filter { $0.isNewThisWeek },
                    unseenCount: store.unseenEventCount
                ) {
                    store.markAllNewEventsSeen()
                    showHistorial = true
                }
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: store.unseenEventCount)
        .navigationTitle("Manual")
        .toolbarBackground(.ultraThinMaterial, for: .navigationBar)
        .navigationDestination(for: Procedure.self) { procedure in
            ProcedureDetailView(procedure: procedure)
                .onAppear { store.recordRecent(procedure.id) }
        }
        .navigationDestination(for: ProcedureSection.self) { section in
            SectionDetailView(section: section)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showSearch = true } label: {
                    Image(systemName: "magnifyingglass")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showMenu = true } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showSearch) { GlobalSearchView() }
        .sheet(isPresented: $showMenu) {
            AppMenuSheet().presentationDetents([.large])
        }
        .sheet(isPresented: $showHistorial) { HistorialView() }
    }
}

// MARK: - ProcedureRow (used by SectionDetailView — keep unchanged)

struct ProcedureRow: View {
    let procedure: Procedure
    var showSection: Bool = false

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            RoundedRectangle(cornerRadius: 3)
                .fill(procedure.color)
                .frame(width: 3, height: 40)

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

                    if showSection {
                        SectionBadge(label: procedure.sectionDisplayName, color: procedure.color)
                    }
                }
            }
        }
        .padding(.vertical, 3)
    }
}

// MARK: - ProcedurePill (kept for GlobalSearchView compatibility — remove after search is updated)

struct ProcedurePill: View {
    let procedure: Procedure

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 7) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(procedure.color)
                    .frame(width: 3, height: 28)
                Text(procedure.title)
                    .font(.samurCaption.weight(.medium))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: 132, alignment: .leading)
            }
            Text(procedure.id)
                .font(.samurMono)
                .foregroundStyle(.secondary)
                .padding(.leading, 10)
        }
        .padding(.horizontal, 11)
        .padding(.vertical, 9)
        .samurGlassCard(cornerRadius: 12, tint: procedure.color)
        .pressScale()
    }
}
```

- [ ] **Step 2: Build**

⌘B. Expected: build succeeds. If `flexibleFrame` is undefined remove it — it was a typo in BreakingNewsRibbon (Step 1 Task 3); replace with `.frame(width: 16)`.

- [ ] **Step 3: Run in simulator and verify scroll order**

Run on iPhone 15 simulator. Manual tab should show:
- (ribbon if unseen events)
- Recientes section with rounded card
- Favoritos section (or hidden if empty)
- Secciones section — all sections with color left-bar and procedure count
- Historial button at bottom with optional red badge

Check dark mode: Settings → Developer → Dark Appearance. All backgrounds should adapt correctly.

- [ ] **Step 4: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Manual/ManualView.swift"
git commit -m "feat(ios/manual): rebuild ManualView as minimal clinical scroll layout"
```

---

## Task 5: HistorialSheet — Adapt Presentation

**Files:**
- Modify: `apps/ios/ManualSAMUR/Views/Manual/HistorialView.swift`

The existing `HistorialView` has all the right logic (groupedEvents, DiffView, ChangeKindBadge, EventRow). Only the presentation and the date header need updating to match the Minimal Clinical design.

- [ ] **Step 1: Update HistorialView to use proper sheet presentation options and date-grouped timeline**

Replace the entire `HistorialView` struct body (lines 24–57). Keep all private structs (`EventRow`, `ChangeKindBadge`, `CategoryIcon`, `DiffView`) unchanged.

New `HistorialView` body:

```swift
struct HistorialView: View {
    @Environment(DataStore.self) private var store
    @Environment(\.dismiss) private var dismiss

    private var groupedEvents: [(date: String, events: [ManualUpdateEvent])] {
        let sorted = store.updateEvents.sorted { $0.effectiveDate > $1.effectiveDate }
        var groups: [(date: String, events: [ManualUpdateEvent])] = []
        var dateMap: [String: [ManualUpdateEvent]] = [:]
        var dateOrder: [String] = []
        for event in sorted {
            if dateMap[event.effectiveDate] == nil { dateOrder.append(event.effectiveDate) }
            dateMap[event.effectiveDate, default: []].append(event)
        }
        for date in dateOrder {
            groups.append((date: date, events: dateMap[date]!))
        }
        return groups
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.updateEvents.isEmpty {
                    ContentUnavailableView(
                        "Sin historial",
                        systemImage: "clock.badge.questionmark",
                        description: Text("No hay actualizaciones disponibles")
                    )
                } else {
                    List {
                        ForEach(groupedEvents, id: \.date) { group in
                            Section {
                                ForEach(group.events) { event in
                                    EventRow(event: event)
                                }
                            } header: {
                                HStack(spacing: Spacing.sm) {
                                    Text(formatDate(group.date))
                                        .font(.samurSubheadline)
                                        .foregroundStyle(.primary)
                                    if group.events.contains(where: { $0.isNewThisWeek && !store.seenEventIds.contains($0.eventId) }) {
                                        Text("NUEVO")
                                            .font(.samurCaption2.weight(.bold))
                                            .foregroundStyle(.white)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 2)
                                            .background(Color.red, in: Capsule())
                                    }
                                }
                                .textCase(nil)
                                .padding(.vertical, Spacing.xs)
                            }
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Actualizaciones")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Cerrar") { dismiss() }
                }
            }
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Radius.lg)
        .onAppear { store.markAllNewEventsSeen() }
    }

    private func formatDate(_ raw: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.locale = Locale(identifier: "es_ES")
        guard let date = formatter.date(from: raw) else { return raw }
        let out = DateFormatter()
        out.dateFormat = "d 'de' MMMM 'de' yyyy"
        out.locale = Locale(identifier: "es_ES")
        return out.string(from: date)
    }
}
```

Note: `store.seenEventIds` is now accessible because it is `private(set)` (readable from outside DataStore).

- [ ] **Step 2: Build**

⌘B. Expected: build succeeds.

- [ ] **Step 3: Verify in simulator**

Tap the Historial button on the Manual home. The sheet slides up. Date section headers show the full date in `.primary` colour. "NUEVO" badge appears next to dates with unseen events. After opening, tap the ribbon — ribbon disappears because `markAllNewEventsSeen()` fired on `.onAppear` and `unseenEventCount` is now 0. Tap a "Ver cambios" button — diff block expands with red/green lines.

- [ ] **Step 4: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Manual/HistorialView.swift"
git commit -m "feat(ios/manual): update HistorialView with date-grouped timeline and NUEVO badges"
```

---

## Task 6: UnderlineTabPicker Shared Component

**Files:**
- Create: `apps/ios/ManualSAMUR/Views/Shared/UnderlineTabPicker.swift`

- [ ] **Step 1: Create UnderlineTabPicker.swift**

```swift
// apps/ios/ManualSAMUR/Views/Shared/UnderlineTabPicker.swift
import SwiftUI

/// Scrollable underline tab bar — works for any number of tabs.
/// Uses matchedGeometryEffect on the indicator line only (not the label).
struct UnderlineTabPicker<T: Hashable>: View {
    let tabs: [(label: String, value: T)]
    @Binding var selection: T
    @Namespace private var indicatorNS

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(alignment: .bottom, spacing: 0) {
                    ForEach(tabs, id: \.value) { tab in
                        let isSelected = selection == tab.value

                        Button {
                            withAnimation(.spring(response: 0.28, dampingFraction: 0.75)) {
                                selection = tab.value
                            }
                            HapticFeedback.selection()
                        } label: {
                            VStack(spacing: Spacing.xs) {
                                Text(tab.label)
                                    .font(isSelected ? .samurSubheadline : .samurCallout)
                                    .foregroundStyle(isSelected ? Color.samurPrimary : Color.secondary)
                                    .padding(.horizontal, Spacing.lg)
                                    .padding(.top, Spacing.sm)
                                    .padding(.bottom, Spacing.sm - 2)

                                if isSelected {
                                    RoundedRectangle(cornerRadius: 1.5)
                                        .fill(Color.samurPrimary)
                                        .frame(height: 2)
                                        .matchedGeometryEffect(id: "indicator", in: indicatorNS)
                                } else {
                                    Color.clear.frame(height: 2)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .id(tab.value)
                    }
                }
            }
            .onChange(of: selection) { _, newValue in
                withAnimation { proxy.scrollTo(newValue, anchor: .center) }
            }
        }
        .overlay(alignment: .bottom) {
            Divider()
        }
    }
}
```

Add the file to the Xcode project target.

- [ ] **Step 2: Build**

⌘B. Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Shared/UnderlineTabPicker.swift" \
        "apps/ios/ManualSAMUR.xcodeproj/project.pbxproj"
git commit -m "feat(ios/design): add UnderlineTabPicker shared scrollable tab component"
```

---

## Task 7: CodigosView — Adopt UnderlineTabPicker + List Rows

**Files:**
- Modify: `apps/ios/ManualSAMUR/Views/Codigos/CodigosView.swift`

- [ ] **Step 1: Replace typePicker with UnderlineTabPicker**

Find the `typePicker` computed property (starts around line 62). Replace the entire `typePicker` property with:

```swift
    private var typePicker: some View {
        UnderlineTabPicker(
            tabs: availableTypes.map { (label: codigoTypeLabels[$0] ?? $0, value: $0) },
            selection: $selectedType
        )
        .background(.ultraThinMaterial)
        .onChange(of: selectedType) { _, _ in showScrollToTop = false }
    }
```

Remove `@Namespace private var typePickerNS` (line 13) — it is no longer needed.

- [ ] **Step 2: Verify code list rows use consistent styling**

The `mainContent` for non-special types currently renders code items in a `List`. Verify each code row already uses `ProcedureRow`-style with a colored bar. If it uses a custom card grid, update to list rows. Find the `codesList` or equivalent and ensure rows look like:

```swift
// Inside the list, for each code item:
Button {
    selectedCode = code
    HapticFeedback.light()
} label: {
    HStack(spacing: 0) {
        Rectangle().fill(Color.samurPrimary).frame(width: 3)
        HStack(spacing: Spacing.sm) {
            Text(code.code)
                .font(.samurMono)
                .foregroundStyle(.white)
                .padding(.horizontal, 7)
                .padding(.vertical, 3)
                .background(Color.samurPrimary, in: RoundedRectangle(cornerRadius: 5))
            Text(code.name)
                .font(.samurSubheadline)
                .foregroundStyle(.primary)
                .lineLimit(2)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(Color(.tertiaryLabel))
        }
        .padding(.horizontal, Spacing.md)
        .padding(.vertical, Spacing.sm + 2)
    }
    .frame(minHeight: 44)
    .background(Color(.secondarySystemGroupedBackground))
    .pressScale()
}
.buttonStyle(.plain)
```

- [ ] **Step 3: Build**

⌘B. Expected: build succeeds. `@Namespace` removal may trigger a warning if unused — remove it.

- [ ] **Step 4: Verify in simulator**

Códigos tab: underline tabs appear for all available types. Tapping a tab scrolls the indicator with animation + haptic. Tapping a code row opens the detail sheet.

- [ ] **Step 5: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Codigos/CodigosView.swift"
git commit -m "feat(ios/codigos): replace matched-geometry picker with UnderlineTabPicker"
```

---

## Task 8: VademecumView — Adopt UnderlineTabPicker

**Files:**
- Modify: `apps/ios/ManualSAMUR/Views/Vademecum/VademecumView.swift`

- [ ] **Step 1: Locate and replace the tab picker**

Find the tab picker section in VademecumView (uses the same matched-geometry capsule pattern as CodigosView). It likely has a `@State private var selectedTab` and `@Namespace`. Replace the picker view with:

```swift
    private let tabs: [(label: String, value: String)] = [
        ("Fármacos", "farmacos"),
        ("Perfusiones", "perfusiones"),
        ("Fluidos", "fluidos"),
        ("Comerciales", "comerciales")
    ]

    private var tabPicker: some View {
        UnderlineTabPicker(tabs: tabs, selection: $selectedTab)
            .background(.ultraThinMaterial)
    }
```

Remove the `@Namespace` property.

- [ ] **Step 2: Remove `.samurPageBackground()` call**

Find `.samurPageBackground()` in VademecumView and replace with `.background(Color(.systemGroupedBackground))` for consistency with ManualView.

- [ ] **Step 3: Build**

⌘B. Expected: build succeeds.

- [ ] **Step 4: Verify in simulator**

Vademécum tab: 4 underline tabs render and animate on selection. Drug list content unchanged.

- [ ] **Step 5: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Vademecum/VademecumView.swift"
git commit -m "feat(ios/vademecum): replace matched-geometry picker with UnderlineTabPicker"
```

---

## Task 9: Haptics + Microinteraction Polish Pass

**Files:**
- Modify: `apps/ios/ManualSAMUR/Views/Manual/ProcedureDetailView.swift`
- Modify: `apps/ios/ManualSAMUR/Views/Manual/HistorialView.swift`

**Full haptic map:**

| Interaction | Call |
|---|---|
| Tab picker change (Códigos, Vademécum) | `HapticFeedback.selection()` ← already in UnderlineTabPicker |
| Breaking news ribbon appear | `HapticFeedback.warning()` ← already in BreakingNewsRibbon |
| Mark all seen (tap ribbon) | `HapticFeedback.success()` |
| Diff toggle open | `HapticFeedback.light()` |
| Favourite toggle on | `HapticFeedback.medium()` |
| Favourite toggle off | `HapticFeedback.light()` |
| Procedure push (row tap) | `HapticFeedback.light()` ← already in ManualView |
| Scroll-to-top FAB | `HapticFeedback.rigid()` |
| Prev/Next procedure nav | `HapticFeedback.light()` |
| Historial button tap | `HapticFeedback.light()` ← already in ManualView |
| Code/Drug row tap | `HapticFeedback.light()` ← already in CodigosView |

- [ ] **Step 1: Add `.success()` haptic when ribbon is tapped to mark-all-seen**

In `ManualView.swift`, the ribbon's `onTap` closure is:
```swift
) {
    store.markAllNewEventsSeen()
    showHistorial = true
}
```
Add haptic before opening the sheet:
```swift
) {
    store.markAllNewEventsSeen()
    HapticFeedback.success()
    showHistorial = true
}
```

- [ ] **Step 2: Add haptic to diff toggle in HistorialView**

In `HistorialView.swift`, find the `EventRow` struct's `Button` action for the diff toggle (around line 98):
```swift
Button {
    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { showDiff.toggle() }
} label: {
```
Add haptic:
```swift
Button {
    HapticFeedback.light()
    withAnimation(.spring(response: 0.3, dampingFraction: 0.75)) { showDiff.toggle() }
} label: {
```

- [ ] **Step 3: Add favourite toggle haptics in ProcedureDetailView**

Find the favourite toggle button in `ProcedureDetailView.swift`. It likely reads/writes `UserDefaults.standard.stringArray(forKey: "favorites")`. Find the action and add:

```swift
// When adding to favourites:
HapticFeedback.medium()
// When removing from favourites:
HapticFeedback.light()
```

Also add star symbol effect. Find the `star.fill` / `star` image and add:

```swift
Image(systemName: isFavourite ? "star.fill" : "star")
    .symbolEffect(.bounce, value: isFavourite)
```

- [ ] **Step 4: Add scroll-to-top FAB haptic in ProcedureDetailView**

Find the scroll-to-top button action in `ProcedureDetailView.swift`. Add before the scroll action:
```swift
HapticFeedback.rigid()
```

- [ ] **Step 5: Add prev/next navigation haptics in ProcedureDetailView**

Find the previous/next procedure navigation buttons. Add `HapticFeedback.light()` to each action.

- [ ] **Step 6: Build**

⌘B. Expected: build succeeds.

- [ ] **Step 7: Verify on device (or simulator with haptic simulation)**

Tap the diff toggle in Historial — light haptic. Toggle a favourite — medium tap on star. Navigate prev/next procedure — light haptic each step. Tap scroll-to-top FAB — rigid haptic.

- [ ] **Step 8: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Manual/ManualView.swift" \
        "apps/ios/ManualSAMUR/Views/Manual/HistorialView.swift" \
        "apps/ios/ManualSAMUR/Views/Manual/ProcedureDetailView.swift"
git commit -m "feat(ios/ux): add comprehensive haptic feedback across all interactions"
```

---

## Task 10: Empty States + Navigation Polish

**Files:**
- Modify: `apps/ios/ManualSAMUR/Views/Codigos/CodigosView.swift`
- Modify: `apps/ios/ManualSAMUR/Views/Vademecum/VademecumView.swift`
- Modify: `apps/ios/ManualSAMUR/App/RootView.swift`

- [ ] **Step 1: Empty state for Códigos type with no entries**

In `CodigosView.swift`, find where `mainContent` renders a list for non-special types. Wrap the list content with an empty state check:

```swift
let items = store.codes(for: selectedType)
if items.isEmpty {
    ContentUnavailableView(
        "Sin códigos",
        systemImage: "antenna.radiowaves.left.and.right.slash",
        description: Text("No hay códigos disponibles para este tipo")
    )
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .padding(.top, 60)
} else {
    // existing list
}
```

- [ ] **Step 2: Empty state for Vademécum drug search**

In `VademecumView.swift`, find where search results are rendered when the query has no matches. Add:

```swift
if filteredItems.isEmpty && !searchQuery.isEmpty {
    ContentUnavailableView.search(text: searchQuery)
}
```

- [ ] **Step 3: Add sheet presentation polish to all sheets**

All sheets already have `.presentationDetents`. Add `.presentationDragIndicator(.visible)` and `.presentationCornerRadius(Radius.lg)` where missing.

In `CodigosView.swift`, find the `CodeDetailView` sheet:
```swift
.sheet(item: $selectedCode) { code in
    CodeDetailView(code: code)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Radius.lg)
}
```

In `ManualView.swift`, update the search and menu sheets:
```swift
.sheet(isPresented: $showSearch) {
    GlobalSearchView()
        .presentationDragIndicator(.visible)
}
.sheet(isPresented: $showMenu) {
    AppMenuSheet()
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(Radius.lg)
}
.sheet(isPresented: $showHistorial) {
    HistorialView()
}
```
(HistorialView already sets its own presentation options from Task 5.)

- [ ] **Step 4: Build**

⌘B. Expected: build succeeds.

- [ ] **Step 5: Verify end-to-end**

Run on iPhone 15 simulator. Check the full verification list:
- [ ] Manual home: ribbon, recientes, favoritos, secciones, historial button all render correctly
- [ ] Ribbon taps: sheet opens, ribbon disappears after mark-seen, badge clears on button
- [ ] Dark mode: Settings → Developer → Dark Appearance — all sections adapt, no grey-on-grey or invisible text
- [ ] Códigos: all 12 types reachable via underline tabs, haptic on each switch, detail sheet opens
- [ ] Vademécum: 4 underline tabs work, drug detail sheet opens
- [ ] Historial: date groups correct, NUEVO badge on unseen groups, diff toggle expands/collapses with animation
- [ ] Favourite toggle: star bounce animation + haptic
- [ ] Scroll-to-top FAB: rigid haptic
- [ ] Prev/Next procedure: light haptic each step
- [ ] Empty Códigos type: ContentUnavailableView shows
- [ ] All sheets: drag indicator visible, rounded corners

- [ ] **Step 6: Commit**

```bash
git add "apps/ios/ManualSAMUR/Views/Codigos/CodigosView.swift" \
        "apps/ios/ManualSAMUR/Views/Vademecum/VademecumView.swift" \
        "apps/ios/ManualSAMUR/App/RootView.swift" \
        "apps/ios/ManualSAMUR/Views/Manual/ManualView.swift"
git commit -m "feat(ios/ux): empty states, sheet presentation polish, end-to-end verification"
```

---

## Self-Review Checklist

- [x] Spec §1 Design System → Task 1 ✓
- [x] Spec §2 ManualView scroll order (ribbon → recientes → favoritos → secciones → historial button) → Tasks 3, 4 ✓
- [x] Spec §3 HistorialSheet: date groups, diff toggle, NUEVO badge → Task 5 ✓
- [x] Spec §4 UnderlineTabPicker for both Códigos and Vademécum → Tasks 6, 7, 8 ✓
- [x] Spec §5 Haptic map — all 9 interactions covered → Task 9 ✓
- [x] Spec §6 Empty states (Códigos, Vademécum search) → Task 10 ✓
- [x] Spec §7 Navigation/sheet polish → Task 10 ✓
- [x] `seenEventIds` stored property for ribbon reactivity → Task 1 ✓
- [x] `.pressScale()` on all interactive rows → Tasks 2, 4 ✓
- [x] Star `.symbolEffect(.bounce)` → Task 9 ✓
- [x] Type names consistent: `ProcedureListRow`, `SectionGroup`, `UnderlineTabPicker`, `BreakingNewsRibbon`, `MarqueeText` — no mismatches ✓
