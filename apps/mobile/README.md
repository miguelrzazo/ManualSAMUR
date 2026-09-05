# Pulso abierto mobile

Pulso abierto is the independent ManualSAMUR reference companion. The app is intentionally local-first:
the generated v2 content snapshot is bundled, favorites and recents stay in AsyncStorage,
and an update is accepted only after its package integrity validates. A failed or
interrupted refresh leaves the last known-good snapshot in place.

On the first launch, the app presents a one-time notice that this is an unofficial,
reference-only adaptation. Acknowledgement is stored locally; subsequent launches open
the Inicio tab directly without focusing the search field. Información y ajustes exposes
content sync status, the disclaimer/source/legal text, and System/Light/Dark appearance.

## Run

From the repository root:

```bash
npm run mobile:content
cd apps/mobile
npm ci --ignore-scripts
npm run start:dev-client
```

The approved local runtime is Node 22.13+, Expo SDK 57 (`expo@57.0.20` in the lockfile),
React Native 0.86.3, and React 19.2.3. `package.json` prevents accidentally using Node 23+
with this Expo generation; `npm ci` is the clean-install boundary. The Expo-managed
scaffold is intentional: the native boundary is `expo run:ios` / `expo run:android`, while
the repository keeps no generated `ios/` or `android/` directories.
The iOS deployment target is explicitly pinned to 16.4, matching the SDK 57 minimum and
Xcode 26.4+ baseline.

For native simulator builds (Xcode and an Android SDK/emulator are required):

```bash
npm run ios       # from apps/mobile; prebuilds and installs on the selected iOS simulator
npm run android   # from apps/mobile; prebuilds and installs on the selected Android emulator
```

The `development` profile in `eas.json` is reserved for a development client build. Expo
Go can exercise the current managed JavaScript surface, but is not the native acceptance
target.

## V1 boundaries

- Procedures, vademecum, codes, abbreviations, favorites, recents, and official attachment
  manifests resolve from the local package.
- The map tab provides an offline directory and schematic locations. Full offline tiles and
  routing are deliberately not claimed until provider feasibility is resolved.
- Updates are local-only and transactional at the snapshot level. The API endpoint is the
  existing `/api/mobile/content/v2` contract. Every snapshot carries a content hash and
  package hash; the generator and runtime also verify canonical bytes, stable route keys,
  a matching attachment manifest, and safe `/docs` or `/images` paths.
- Attachment delivery is independent from snapshot activation: optional attachments download
  on demand into a persistent, identity-keyed directory and are opened offline only after
  byte length and SHA-256 match the manifest. Interrupted, cancelled, failed, missing, or
  corrupt files remain retryable/unavailable and never appear as local content.
- Essential attachment release policy is intentionally unfrozen in
  `attachment-release-policy.json`. The empty, unapproved allowlist is a safety boundary;
  the owner must approve the future allowlist and provide every bundled asset before a
  release may be frozen. The 75 MB essential and 150 MB installed V1 caps are enforced by
  `npm run attachments:check-release`.
- There are no accounts, user analytics, or cross-device synchronization paths.

## Acceptance checklist

The release harness should exercise offline launch, search, procedure reading, attachment
opening, favorites, recents, map directory, interrupted refresh, invalid hash rejection,
and rollback on both an iPhone and representative Android device. VoiceOver/TalkBack,
Dynamic Type, reduced motion, touch targets, and the final launcher/splash exports need
human validation before store submission.

## Isolated checks

Run these without invoking the web app build:

```bash
npm run mobile:content
npm run mobile:content:validate
npm run mobile:typecheck
npm --prefix apps/mobile run attachments:check-release # expected to remain blocked until owner approval
```

The web checks remain separate (`npm test`, `npm run lint`, and `npm run build`).
