# ManualSAMUR mobile

Expo surface for the ManualSAMUR reference product. The app is intentionally local-first:
the generated v2 content snapshot is bundled, favorites and recents stay in AsyncStorage,
and an update is accepted only after its SHA-256 content hash validates. A failed or
interrupted refresh leaves the last known-good snapshot in place.

## Run

From the repository root:

```bash
npm run mobile:content
cd apps/mobile
npm install
npx expo start
```

The app uses the development-client profile in `eas.json` for native testing. The exact
minimum OS versions, final Expo SDK, map tile provider, tile packaging budget, analytics,
and crash-reporting policy remain release decisions documented by the Wayfinder ticket.

## V1 boundaries

- Procedures, vademecum, codes, abbreviations, favorites, recents, and official attachment
  manifests resolve from the local package.
- The map tab provides an offline directory and schematic locations. Full offline tiles and
  routing are deliberately not claimed until provider feasibility is resolved.
- Updates are local-only and transactional at the snapshot level. The API endpoint is the
  existing `/api/mobile/content/v2` contract, with metadata and hash validation.
- There are no accounts, user analytics, or cross-device synchronization paths.

## Acceptance checklist

The release harness should exercise offline launch, search, procedure reading, attachment
opening, favorites, recents, map directory, interrupted refresh, invalid hash rejection,
and rollback on both an iPhone and representative Android device. VoiceOver/TalkBack,
Dynamic Type, reduced motion, touch targets, and the final launcher/splash exports need
human validation before store submission.
