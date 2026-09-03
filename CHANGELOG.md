# Changelog

## 0.2.0

Server-side geolocation opt-out, matching intempt-swift and intempt-android.

### Added

- `useIpAddressForGeolocation` on `IntemptConfig` (`init`). Controls whether Intempt derives
  country, region and city from the address a request already arrives on — the SDK never reads
  or sends the device's address itself; it sends `?ip=1` / `?ip=0` and the platform resolves and
  discards the connection address. Defaults to `true`, matching intempt-swift and android-sdk.
  Leaving it on means the app collects Coarse Location for Apple's privacy-label purposes; see
  `src/types.ts`'s doc comment on the field.
- A second `init()` call for an existing instance that asks for a *different*
  `useIpAddressForGeolocation` now warns (via `console.warn`) instead of silently discarding the
  request — matches both native SDKs' own warning on the same case.

### Removed

- **BREAKING:** `IntemptInstance.alias(userId, anotherUserId)`. Linking two user identities is
  the CDP's job, not the caller's: identity resolution already converges two user ids the moment
  they share any identifier, so `alias` only reached the case where two ids never co-occur at
  all — an id-scheme migration, which belongs in a server-side backfill. `identify` is unchanged
  and remains the stitch trigger.

## 0.1.2 — unreleased

Feature flags: read a value by key from the same serving endpoint the rest of Experiences uses.

### Removed

- **BREAKING:** `alias(userId, anotherUserId)`. Linking two user identities is the CDP's job,
  not the caller's: identity resolution already converges two user ids the moment they share
  any identifier, so `alias` only reached the case where two ids never co-occur at all — an
  id-scheme migration, which belongs in a server-side backfill. A wrong call permanently fused
  two real people and there is no unmerge. `identify` is unchanged and remains the stitch
  trigger. Removed on all three sides of the bridge: the TS surface, the iOS `RCT_EXTERN_METHOD`
  and its Swift implementation, and the Android `@ReactMethod`. The pinned native versions are
  untouched — each native SDK drops `alias` on its own release.

### Added

- `variation(key, context, defaultValue)` — the value assigned for a key, or the caller's
  default. Ask for a KEY, never a mode: the platform's serving query filters on channel and
  status and never on mode, so the same call reads an experiment, a personalization or a flag.
- `boolVariation` / `stringVariation` / `numberVariation` — typed narrowing over `variation`.
  A wrongly-typed served value returns the default; it is never coerced, because `Boolean('false')`
  is `true` and a silent coercion is indistinguishable from a real answer.
- `allFlags(context)` — every key assigned to this person, in one call.
- `waitForInitialization(timeoutMs?)` — resolves immediately. Evaluation is remote on both
  platforms, so there is no local flag store to wait for. Present so the cross-SDK surface is
  identical everywhere.
- `FlagContext` — `userId` and `profileId`, both optional. Omitting `profileId` lets the native
  SDK supply the device identifier it already holds, which is what keeps an assignment stable
  across sign-in (`EXP-ASSIGN-005`).
- `check-no-local-bucketing.mjs`, a dependency-free CI guard. The server buckets, so no second
  implementation can disagree with it (`EXP-ASSIGN-004` / `EXP-ASSIGN-005`).

### Behaviour worth knowing before you upgrade

- **A service failure never throws.** A 5xx, a timeout or an unknown key returns your
  `defaultValue` on both platforms. An SDK that throws when the service is unreachable takes the
  application down with it, which is the opposite of what a kill switch is for.
- **A programming error does throw.** A blank key, a key outside `^[a-zA-Z0-9_-]+$`, or an
  `undefined` default fails at the call site rather than silently becoming a default.
- `variationDetail` is deliberately **not** exposed. See `docs/CONVENTIONS.md`; it is
  `EXP-SERVE-001` pending at the platform, and closing it here will be a breaking major.

### Known gaps

- Flags are unobserved by the mutation gate and by every unit test, because both live in the
  native bridges. See `docs/TESTING.md`.

### Fixed

- Version bumped 0.1.1 → 0.1.2 because **0.1.1 is already on npm** (published 2026-08-21) and
  contains no flag surface. Publishing this tree as 0.1.1 would republish a different artifact
  under a version a consumer already resolves.
- **Both native pins now resolve to a release that carries the flag surface.** `Intempt` moves
  0.1.1 → **0.2.0** (CocoaPods trunk; 0.1.1 was never published, intempt-swift shipped the
  surface as 0.2.0) and `com.intempt.sdk:intempt-android` moves 3.0.4 → **3.1.0** (Maven
  Central). Both verified by download, not by version number.
- **Every CI override that stood in for those releases is deleted**, so no native job builds
  against a branch: the `INTEMPT_SWIFT_REF` / `INTEMPT_ANDROID_REF` workflow variables, the
  `:git`/`:branch` Podfile append in `ios-build` and `scripts/run-e2e-ios.sh`, and
  `android-build`'s intempt-android checkout, `publishToMavenLocal` and repository-reordering
  init script. Four jobs had been green against artifacts no consumer could obtain.
  `ios-typecheck` now derives the intempt-swift tag from the podspec pin rather than holding a
  second copy of the version.

## Unreleased

Initial scaffold. Not published.

### Added

- TypeScript public API implementing the Intempt SDK API contract
- TurboModule spec with codegen config, legacy bridge interop retained
- iOS native module over `intempt-swift`
- Android native module over `intempt-android`, with named rejections for the
  13 contract methods that SDK has not adopted yet
- Contract fixture corpus (30 fixtures, 26 methods) plus a dependency-free
  completeness gate that runs before `npm install`

### Fixed before first release

- iOS module called `Intempt.initialize` and `Intempt.instance(named:)`. Both
  are statics on `IntemptInstance`; the `Intempt` enum holds only SDK-wide
  constants. Neither call would have compiled.

### Known gaps

- `intempt-android` 3.0.0 is not on Maven Central — the latest published
  version is 2.0.1, so a consumer's Gradle sync cannot resolve the dependency
  this package requires. CI resolves it only via a local `3.0.0-LOCAL` publish
- `setPushToken`, `trackPushOpen` and `trackPushReceived` reject with
  `unsupported_on_android`; push registration lives inside `FirebaseService`
  and is not on 3.0's public surface
- `eventTitle` on `identify()` and `group()` is left unset by default because
  the two SDKs disagree: `intempt-android` reserves the name "identify" and
  rejects it case-insensitively, while `intempt-swift` defaults to it. Each
  platform now names the event itself

### Not a gap, previously misreported

The 2026-08-11 audit with 58 findings was against `ios-source`
(`intempt/intempt-ios`), the deprecated Objective-C SDK — not against
`intempt-swift`. That audit is why `intempt-swift` exists. The real risk to
carry is that 0.1.0 is a first release with no production mileage, which is why
the podspec pins it exactly rather than with `~>`.
