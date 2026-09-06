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
- Procedure Markdown tables render as native, horizontally scrollable and accessible tables.
  The parser supports GFM tables and the legacy pipe-table form found in the synced corpus,
  including escaped separators, empty cells, multiline cells, and surrounding ordered lists.
- The map tab keeps the searchable offline directory and accessible schematic, and can activate
  the approved online map: MapLibre GL Native renders CARTO Positron/Dark Matter styles over
  OpenStreetMap data with the required attribution. Network, provider, stale-data, and location
  failures fall back to the local directory/schematic; location is requested only after the
  person explicitly asks to use it. The approved optional Madrid offline pack is managed through
  MapLibre's native offline support. The app does not claim traffic-aware routing or live capacity.
- Updates are local-only and transactional at the snapshot level. The API endpoint is the
  existing `/api/mobile/content/v2` contract. Every snapshot carries a content hash and
  package hash; the generator and runtime also verify canonical bytes, stable route keys,
  a matching attachment manifest, and safe `/docs` or `/images` paths.
- **All attachments are essential** (owner decision, issue #62): every attachment the
  content sync could resolve is bundled offline inside the app at build time, not
  downloaded on demand. `attachment-release-policy.json` is approved with all 310
  resolvable attachment ids as `essentialAttachmentIds`; the `notes` field records the
  owner decision, the byte total, and the 8 exclusions in Spanish. The iOS
  (`plugins/with-ios-attachment-assets.js`) and Android
  (`plugins/with-android-attachment-assets.js`) config plugins copy those 310 files
  from `public/docs` and `public/images` into the native project during
  `expo prebuild`, preserving each attachment's `localPath` layout so
  `attachment-runtime.ts`'s bundle lookup (`Paths.bundle` + `localPath`) resolves them.
  Nothing is downloaded at runtime for these; `downloadOptionalAttachment` remains as a
  defensive fallback path, not the primary delivery mechanism.
  - **8 of 318 manifest attachments cannot be bundled.** Their source files were never
    recovered by content sync (no `byteLength`/`sha256`), and every one of their
    `sourceUrl`s was confirmed to return HTTP 404 against servpub.madrid.es — they are
    gone from the upstream wiki, not merely slow to sync. They are one image
    (procedure 606_03a) and seven PDFs (procedure 314_05's intranasal medication sheet,
    and procedure 509's six `509.1`–`509.6` documents). `attachment-runtime.ts` treats
    any attachment lacking that metadata as permanently unavailable
    (`isAttachmentUnavailableUpstream`): `reconcileAttachmentRecord` pins it to `failed`
    with a fixed Spanish notice pointing at the (possibly stale) official `sourceUrl`,
    and `downloadOptionalAttachment` refuses to attempt a network fetch for it. They
    never render as pending, broken, or "available on demand" — only as an explicit
    external link.
  - **Deviation from the issue #26 spec, accepted knowingly.** The spec's initial-download
    target is 50 MB; bundling the 310 resolvable attachments adds ~56.5 MB (59,243,267
    bytes measured from the manifest), which exceeds that target. It stays comfortably
    under both the 75 MB essential and 150 MB installed V1 caps in `attachment-logic.ts`
    (neither cap was changed for this). The owner chose full offline coverage of the
    manual over the 50 MB target; this is recorded here and in the policy's `notes`
    rather than hidden. `npm run attachments:check-release` enforces the caps and that
    every essential id is bundled and metadata-complete on every run.
- There are no accounts, user analytics, or cross-device synchronization paths.
- The production procedure screen includes an accessible, procedure-scoped update history with
  newest-first events and expandable source diffs. The Inicio-wide history remains a development
  prototype behind `__DEV__`.
- The production Settings sheet exposes content health and recovery, appearance, abbreviations,
  privacy/location/independence/medical notices, and legal/support metadata. Publisher, privacy,
  and support values are intentionally marked pending for now; they are non-clickable and the
  strict release command rejects them until real store-ready values are supplied.

## Acceptance checklist

The release harness should exercise offline launch, search, procedure reading, attachment
opening, favorites, recents, map directory, interrupted refresh, invalid hash rejection,
and rollback on both an iPhone and representative Android device. VoiceOver/TalkBack,
Dynamic Type, reduced motion, touch targets, and the final launcher/splash exports need
human validation before store submission.

## Verification commands

Run the mobile generators and release-policy gates first, then the shared repository checks:

```bash
npm run mobile:content
npm run mobile:content:validate
npm run mobile:typecheck
npm --prefix apps/mobile run attachments:check-release
npm --prefix apps/mobile run locations:check-release
npm --prefix apps/mobile run online-map:check-release
npm test
npm run lint
npm run build
```

The attachment, location, and online-map checks validate approved policy files and should pass for
the committed release configuration. `.maestro/procedure-tables.yaml` is the native smoke flow for
procedure tables; run it against the development client on the available iOS and Android targets.

## Release readiness and internal-test handoff

CI runs `npm run mobile:release:evidence` after the content validation, lint, tests,
mobile typecheck, and web build steps. It retains a dated evidence JSON, schema, gate
matrix, synthetic field checklist, human review checklist, and an EAS-referenced handoff
as an artifact. The collector records commit, build, Node/Expo, content-hash, and
package-hash provenance but never supplies measurements, approvals, signatures, or
secrets. Normal CI reports a blocked readiness package and remains useful; a human can
run `npm run mobile:release:evidence:strict` only after completing every gate.
To validate a completed matrix, pass it back through the collector with
`npm run mobile:release:evidence:strict -- --input=artifacts/completed-evidence.json`;
the command rejects evidence from another commit, snapshot hash/schema/version, Node, or
Expo runtime before preparing the handoff. Strict readiness also requires completed human
review and internal-test approval plus per-platform SHA-256, byte-size, signer, and signed-at
metadata; production submission, rollout, halt, and rollback remain required human decisions.

The handoff is prepared for a human owner to generate and upload signed candidates for
TestFlight and Google Play internal testing. It does not perform any upload, submission,
promotion, pause, halt, rollback, or production approval. See `release/evidence-matrix.json`,
`release/field-validation-checklist.md`, and `release/human-review-checklist.md` for the
required evidence and unresolved owner decisions.

The attachment allowlist/assets, packaged location source, and online-map provider, attribution,
scope, OS floor, and size budget are approved in their committed policy files. The evidence
collector reads those explicit approvals; it does not infer owner approval from a passing CI run.
Accessibility/device review remains human-owned.

The web checks remain separate (`npm test`, `npm run lint`, and `npm run build`).
- The packaged location directory is guarded by `location-source-policy.json`. Its current
  source, 21-hospital scope, source date, and 30-day freshness window are approved and frozen.
  Location permission is requested only after tapping “Usar mi ubicación”, and denial keeps
  the searchable directory and accessible schematic available. Distances are on-device
  straight-line estimates only; a selected point is handed to the platform Maps app.
- `online-map-provider-policy.json` approves MapLibre GL Native 11.3.8 with CARTO Positron/Dark
  Matter and OpenStreetMap attribution, iOS 16.4/Android 24 floors, the measured native size, and
  the Madrid offline-pack scope. The runtime uses `OnlineMapRequest`/`OnlineMapSnapshot`; network,
  provider, stale-data, and permission failures transition to the same local fallback.

Passing automated checks does not authorize a store release. A named human owner must complete
the field-validation and human-review checklists, validate privacy/support URLs and store metadata,
review accessibility and reference-device evidence, provide signed iOS and Android candidates with
hash/size/signing provenance, and explicitly approve TestFlight and Google Play internal testing.
App Store and Play submission, production rollout, pause/halt, and rollback remain separate human
decisions; the repository's release tooling never performs those actions.
