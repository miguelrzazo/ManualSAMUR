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
npm --prefix apps/mobile run attachments:check-release # approved; expected to pass (see "All attachments are essential" above)
```

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

The initial evidence keeps the unresolved owner gates from the Wayfinder work visible:
location source approval (issue 64), online-map provider/licence/scope/size approval
(issue 65), and the manual accessibility review/device evidence (issue 66). Attachment
allowlist/asset approval (issue 62) is resolved — the collector reads
`attachment-release-policy.json`'s `approved` flag and records `ownerGates.attachments`
as `"approved"` accordingly; it is not inferred from a passing CI run, only from that
policy file.

The web checks remain separate (`npm test`, `npm run lint`, and `npm run build`).
- The packaged location directory is guarded by `location-source-policy.json`. Its current
  source, hospital scope, source date, and freshness window are provisional and explicitly
  unapproved/unfrozen; owner approval is required before production content can be frozen.
  Location permission is requested only after tapping “Usar mi ubicación”, and denial keeps
  the searchable directory and accessible schematic available. Distances are on-device
  straight-line estimates only; a selected point is handed to the platform Maps app.
- The online map seam is provider-neutral and disabled by `online-map-provider-policy.json`.
  No SDK, tile endpoint, or provider is selected until the owner records approval for the
  provider, license/attribution, offline scope, OS floor, and installed-size budget. A future
  adapter must use `OnlineMapRequest`/`OnlineMapSnapshot`; network, provider, stale-data, and
  location-permission failures transition to the same offline directory and accessible schematic.
  Run `npm --prefix apps/mobile run online-map:check-release` as a release gate; it is expected
  to fail until those owner decisions are evidenced.
