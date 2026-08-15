# intempt-reactnative — design

**Date:** 2026-08-15
**Status:** approved, scaffolding in progress
**Session:** `session_01KqJXQAYtrYSJKpMQZpguvq`

## What this is

A React Native package that wraps `intempt-swift` on iOS and `intempt-android` on
Android, modelled on `mixpanel-react-native`'s structure.

## Why it is not just a template copy

`mixpanel-react-native` is thin because Mixpanel's two native SDKs are already
symmetric — the wrapper forwards a call and gets out of the way. Intempt's two SDKs
overlap on roughly half their surface, so a wrapper written today would either expose
the intersection (losing flush, reset, identity accessors and all push handling) or
paper over the gaps in JavaScript.

Neither is acceptable, so the decision taken on 2026-08-15 was to make the native SDKs
symmetric first. `intempt-swift`'s shape became the canonical contract
(`intempt-swift/docs/SDK-API-CONTRACT.md`); `intempt-android` conforms to it as a 3.0
clean break. This package is written against that contract, not against either SDK's
current state.

## Sizing, measured

`mixpanel-react-native` at 3.6.0, counted rather than estimated:

| Part | Lines | Inherited |
|---|---:|---|
| `index.js` public API | 1,186 | shape only |
| `javascript/mixpanel-flags*.js` | 1,709 | no |
| `javascript/` queue, network, persistence, storage | 897 | no |
| `android/` module + helpers | 1,332 | rewritten |
| `ios/` Swift + ObjC | 993 | rewritten |
| **Shipped total** | **7,114** | |
| `__tests__/` | 6,296 | structure only |

Roughly 2,600 of their 7,114 shipped lines implement a JavaScript feature-flag engine
and a second event queue. Intempt has no flags product, and both native SDKs own
queueing and durable storage already. Reimplementing either in JavaScript would produce
a worse queue that competes with the good one.

## Architecture

```
        JavaScript / TypeScript
   src/index.ts          public API, contract-shaped
   src/NativeIntempt.ts  TurboModule spec (codegen)
   src/types.ts          shared types
   src/errors.ts         IntemptError + platform rejection
                 |
        ---------+---------
       |                   |
   ios/                android/
   IntemptReactNative     IntemptReactNativeModule.kt
     .swift / .mm         IntemptReactNativePackage.kt
       |                   ReadableMapConverter.kt
       |                          |
   intempt-swift          intempt-android
   (CocoaPods)            (Maven Central)
```

The JavaScript layer holds no state. It validates arguments, converts types the bridge
cannot carry, and forwards. Every method returns a Promise.

### New architecture

TurboModule with a codegen spec, legacy interop retained. `mixpanel-react-native` is
legacy-bridge only — no `codegenConfig`, no spec file — and that is the one place where
copying it would be actively wrong. React Native has defaulted to the new architecture
since 0.76, and legacy modules survive only through an interop layer that will not
survive forever.

### Type degradation across the bridge

The bridge carries JSON. Three contract types do not survive it and are converted
explicitly rather than silently:

| Contract type | Crosses as | Re-typed by |
|---|---|---|
| `Date` | ISO 8601 string | native, before enqueue |
| `URL` | string | native, before enqueue |
| `null` | JSON null | native, to the SDK's null type |

Numbers and booleans cross natively. This matters because Android's current
`Map<String, String>` surface would stringify both — a caller passing `{count: 3}` ships
`"3"`. Typed attribute values are a contract requirement for exactly this reason.

### Platform gaps

A contract method absent on one platform rejects with `unsupported_on_android` or
`unsupported_on_ios` plus the method name. It does not resolve silently and does not
throw at import time. As `intempt-android` conforms, these rejections disappear; the
fixture corpus is what proves it.

One sanctioned permanent exception: Android's `doNotCaptureText(View)` takes a native
view and cannot cross the bridge. It is absent from the JavaScript surface entirely
rather than exposed and broken.

## Conformance testing

A fixture corpus of `(method, arguments) -> expected native call` is committed here and
mirrored into both SDK repos, where it is asserted against the wire payload.

Two rules, both from incidents rather than theory:

1. **Assert on delivery, not payload shape.** The Android transport shipped a version
   that posted `headers = null`, took a 401 on every batch, and deleted the queue on
   terminal errors. Payloads were perfectly correct while 100% of events were lost. A
   corpus that only checks payload shape passes that build.
2. **A fixture that has never failed has never been tested.** Break the line it covers
   and watch it go red before trusting it.

Android additionally publishes `app/api/app.api` through binary-compatibility-validator,
a machine-readable declared surface. The corpus diffs that against the contract
mechanically, so a conformance gap is a red build rather than a review finding.

## Dependencies

Runtime dependencies: none.

`mixpanel-react-native` depends on `base-64`, `json-logic-js`,
`react-native-get-random-values` and `uuid`, all four in service of the JavaScript flag
engine and JS-mode queue. Without those features there is nothing to depend on. Every
identifier this package needs is generated natively.

## Native prerequisites

### iOS — resolved the same day

At the time this spec was first written, `intempt-swift` had no podspec, no git tags, and
404'd on CocoaPods trunk. Routed to the iOS session; they landed it within hours.

Current state, verified against the remote:

- `Intempt.podspec` at the repo root, floors matching `Package.swift`
- tag `v0.1.0` pushed (`b3417ba0`)
- `sdkVersion` moved off `"0.0.1"` to `"0.1.0"`
- the repository is **public**, so both SPM and a git-referenced pod resolve anonymously

One prerequisite remains: `pod trunk push` has not run, because registering a trunk
session is an email round-trip against a real account. Until it does, a consumer resolves
the dependency from git rather than from trunk:

```ruby
pod 'Intempt', :git => 'https://github.com/intempt/intempt-swift.git', :tag => 'v0.1.0'
```

This package pins `'0.1.0'` exactly rather than `'~> 0.1'`. 0.1.0 is a first release —
311 tests pass and the live contract tests run against production, but it has no mileage
in a shipped customer app, so picking up a future 0.1.1 automatically is not a trade worth
making yet.

**Adopt from their podspec:** `PrivacyInfo.xcprivacy` ships via `resource_bundles`, not
`resources`. The App Store checks for the privacy manifest *inside* a third-party
framework, and a loose file at app level does not satisfy that check. Also worth copying
is their `scripts/check-version-sync.sh`, which fails CI when the podspec, the Swift
constant and the git tag disagree — CocoaPods resolves those three independently, and a
pod reporting a version it is not only surfaces when someone debugs a ticket against the
wrong source.

### Android — available

`com.intempt.sdk:intempt-android` is live on Maven Central; 7 versions, latest 2.0.1.

`2.0.1` is not usable: it declares `minSdk 31` and ships `kotlinx-serialization` as
`implementation`, so `recommendation()` does not compile for a consumer. The
`feature/inherit-mixpanel-substrate` branch, which becomes 3.0, sets `minSdk 23` — below
React Native's floor of 24 — and carries the contract work.

This package targets 3.0. There is no working 2.x integration to preserve, which is why
the clean break costs nothing.

## CI

| Job | Asserts |
|---|---|
| typecheck | `tsc --noEmit`, and the `.d.ts` matches the contract |
| unit | jest over the JS layer |
| corpus | every contract method has a fixture |
| android build | module compiles against `intempt-android` |
| ios build | pod installs and the module compiles |

The Android push path needs a `google_apis` emulator image. The `default` image has no
Google Play Services, so FCM token registration cannot succeed and the failure is
opaque — found by the Android SDK session before it cost anyone a day here.

## Out of scope

- **Expo config plugin.** Wanted, but it is a separate package with its own release
  cycle. Not blocking a bare-workflow release.
- **Feature flags.** No Intempt product surface.
- **People / super-properties / group profiles.** Not Intempt's data model.
- **A JavaScript fallback mode.** Both native SDKs own queueing and persistence.

## Open questions

| # | Question | Owner | State |
|---|---|---|---|
| 1 | Pod name and first version for `intempt-swift` | iOS session | **answered** — `Intempt`, `0.1.0` |
| 2 | Do the iOS audit findings block publishing the pod | iOS session | **answered** — see below |
| 3 | `pod trunk push` for `Intempt` | iOS session / Sid | open — needs a registered trunk account |
| 4 | Timeline for `intempt-android` 3.0 contract conformance | Android session / Roman | open |
| 5 | Does `app/api/app.api` stay authoritative post-#16 | Android session | open |

Only 3 and 4 block release.

### Correction: the 58 audit findings are not against `intempt-swift`

An earlier draft of this spec treated the 2026-08-11 audit — 58 findings, including a
button-tap crash, silent data loss, a dropped super-call in the swizzle, and consent that
gated nothing — as a risk carried by the SDK this package depends on. That was wrong, and
it was wrong in the direction that would have delayed a release for no reason.

That audit was against `ios-source` (remote `intempt/intempt-ios`), the deprecated
Objective-C SDK. `intempt-intemptios` is only a thin SPM wrapper around its prebuilt
xcframework. The audit is the *reason* `intempt-swift` was written, not a list of open
defects in it.

`intempt-swift` addresses those findings structurally rather than by patch: `MethodSwizzler`
uses `class_addMethod` then `class_replaceMethod` and restores both IMPs on removal, a
batch is deleted only after the server acknowledges it, and `.reject` consent enforces
rather than merely records.

The real risk to carry is smaller and different: **0.1.0 has no production mileage in a
customer app.** Hence the exact version pin.

Two API details corrected on the same day, both of which this package's iOS module depends
on: `initialize` lives on `IntemptInstance`, not on the `Intempt` enum, and autocapture is
`configure(_:)` plus `start()` rather than settable properties. Autocapture swizzles
nothing until `start()` is called, which is the right default for React Native.
