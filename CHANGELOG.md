# Changelog

## 0.1.2 — unreleased

Feature flags: read a value by key from the same serving endpoint the rest of Experiences uses.

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

- **Neither native pin resolves to a release containing the flag surface.** `intempt-swift`
  0.1.0 on CocoaPods trunk and `com.intempt.sdk:intempt-android:3.0.4` on Maven Central both
  predate it. A consumer installing today gets a bridge that cannot compile.
  `npm run check:native-pins` measures this against both registries and fails until each SDK
  publishes. **Do not tag a release while it fails.**
- Flags are unobserved by the mutation gate and by every unit test, because both live in the
  native bridges. See `docs/TESTING.md`.

### Fixed

- Version bumped 0.1.1 → 0.1.2 because **0.1.1 is already on npm** (published 2026-08-21) and
  contains no flag surface. Publishing this tree as 0.1.1 would republish a different artifact
  under a version a consumer already resolves.

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
