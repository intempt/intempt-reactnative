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

### iOS — blocking

`intempt-swift` cannot be consumed by React Native today. Verified 2026-08-15:

- no `.podspec` in the repository
- zero git tags
- `trunk.cocoapods.org/api/v1/pods/Intempt` → 404, `IntemptSDK` → 404
- `Intempt.sdkVersion` is still `"0.0.1"`

React Native's iOS integration is CocoaPods, so a podspec, a tag and a trunk push are
prerequisites. Routed to the iOS session on 2026-08-15. This package's podspec declares
`s.dependency 'Intempt'` against a version that does not exist yet.

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

| # | Question | Owner |
|---|---|---|
| 1 | Pod name and first real version for `intempt-swift` | iOS session |
| 2 | Do any of the 58 iOS audit findings block making the pod public | iOS session |
| 3 | Timeline for `intempt-android` 3.0 contract conformance | Android session / Roman |
| 4 | Does `app/api/app.api` stay authoritative post-#16 | Android session |

None block scaffolding. All block release.
