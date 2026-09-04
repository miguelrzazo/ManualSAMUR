# ManualSAMUR mobile

Expo surface for the ManualSAMUR reference product. The app is intentionally local-first:
the generated v2 content snapshot is bundled, favorites and recents stay in AsyncStorage,
and an update is accepted only after its package integrity validates. A failed or
interrupted refresh leaves the last known-good snapshot in place.

## Run

From the repository root:

```bash
npm run mobile:content
cd apps/mobile
npm ci --ignore-scripts
npm run start:dev-client
```

The approved local runtime is Node 22.x, Expo SDK 53 (`expo@53.0.27` in the lockfile),
React Native 0.79.5, and React 19.2.4. `package.json` prevents accidentally using Node 23+
with this Expo generation; `npm ci` is the clean-install boundary. The Expo-managed
scaffold is intentional: the native boundary is `expo run:ios` / `expo run:android`, while
the repository keeps no generated `ios/` or `android/` directories.
The managed `with-ios-deployment-target` plugin normalizes all CocoaPods targets to iOS
15.1, including resource-only pods whose upstream podspec still declares an older target.

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
```

The web checks remain separate (`npm test`, `npm run lint`, and `npm run build`).
