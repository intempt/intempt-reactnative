# @intempt-technologies/react-native

Intempt SDK for React Native. Wraps [intempt-swift](https://github.com/intempt/intempt-swift)
on iOS and [intempt-android](https://github.com/intempt/intempt-android) on Android.

> **Not yet published to npm.** Both native prerequisites are satisfied — see
> [Status](#status). The JavaScript layer, the bridge contract and the test suite are
> complete and reviewable now; publishing this package is the one remaining step.

## Status

| Piece | State |
|---|---|
| JavaScript / TypeScript layer | complete |
| TurboModule spec + codegen config | complete |
| Contract fixture corpus | complete, 32 fixtures over 29 methods |
| iOS native module | complete, **typechecked** against `Intempt` 0.1.0 |
| Android native module | complete against `intempt-android` 3.0; 3 push methods reject |
| iOS distribution | **published** — `Intempt 0.1.0` on CocoaPods trunk |
| Android distribution | **published** — `intempt-android` 3.0.1 on Maven Central |
| npm distribution | **not yet published** — release workflow ready, no tag cut yet |

## Install

```sh
npm install @intempt-technologies/react-native
```

```sh
cd ios && pod install
```

No JavaScript dependencies. Everything this package needs is generated natively.

**Requirements:** React Native 0.76+, iOS 15.1+, Android API 24+.

## Where this SDK runs — and where it does not

This SDK is **mobile-only**: Android and iOS devices, simulators and emulators. It is a
wrapper over the native Intempt SDKs, so it works exactly where they do and nowhere else.

- **No web.** react-native-web has no native module. On any platform without one, importing
  the SDK is safe, but `init()` (and every other call) rejects with an `IntemptError` whose
  `isUnsupported` is true — catch it and fall back to
  [intemptjs](https://github.com/intempt/intempt-js). A cross-platform app should split at
  bundle time (`analytics.native.ts` / `analytics.web.ts`); a runtime `Platform.OS` check is
  too late for web bundlers that cannot resolve the native import.
- **No desktop.** react-native-windows / react-native-macos are not supported — same
  `isUnsupported` rejection as web.
- **No servers.** Backend tracking belongs to the
  [Node.js SDK](https://github.com/intempt/intempt-node) (or PHP/Python), with server
  credentials — never this package.
- **No Expo Go.** Native modules require a dev build: `npx expo prebuild`, then
  `expo run:android` / `expo run:ios`.
- **Production only.** The delivery endpoint (`https://api.intempt.com`) is compiled into the
  native SDKs and is not configurable. Credentials from a non-production environment will
  queue events locally and deliver nothing.
- **Platform gaps are errors, not crashes.** A method the current platform's native SDK does
  not implement (for example push methods on Android before `intempt-android` covers them)
  rejects with `isUnsupported` — the same shape as the wrong-platform case, so one branch
  handles both.

## Quick start

```ts
import { init } from '@intempt-technologies/react-native';

const intempt = await init({
  apiKey: 'yourPrefix.yourSecret',
  orgId: 'your-org',
  projectId: 'your-project',
  sourceId: 'your-source',
});

await intempt.track('Signed up', { plan: 'pro', seats: 3, trial: false });
```

`init()` resolves to an instance. Every method on it returns a Promise.

### Verifying it worked

`track()` resolves to whether the event was **accepted into the queue** — not whether
it was delivered.

```ts
const queued = await intempt.track('Signed up');
if (!queued) {
  // opted out, invalid property, encoding failure, or storage unavailable
}

const delivered = await intempt.flush();
console.log(`${delivered} events delivered`);
```

## API

### Identity

```ts
await intempt.identify('user-123', { userAttributes: { email: 'a@b.com' } });
await intempt.group('acct-9', { accountAttributes: { tier: 'enterprise' } });
await intempt.alias('user-123', 'anon-abc');

await intempt.getProfileId();
await intempt.getSessionId();

await intempt.logOut();  // rotate identity, keep the queue
await intempt.reset();   // rotate identity AND empty the queue
```

`logOut()` exists so the next person using a shared device does not inherit the previous
identity. `reset()` additionally discards events not yet delivered. They are not
interchangeable.

### Events

```ts
await intempt.track('Viewed pricing', { source: 'nav' });

await intempt.record('Renewed', {
  userId: 'user-123',
  accountId: 'acct-9',
  data: { mrr: 120 },
});
```

Property values may be strings, numbers, booleans, `null`, `Date`, arrays or nested
objects. `Date` crosses the bridge as ISO 8601 and is re-typed natively.

### Commerce

```ts
await intempt.productView('sku-1');
await intempt.productAdd('sku-1', 2);
await intempt.productOrdered([
  { productId: 'sku-1', quantity: 2 },
  { productId: 'sku-2', quantity: 1 },
]);
```

### Consent

```ts
import { ConsentAction } from 'intempt-react-native';

await intempt.consent(ConsentAction.Accept, 1798761600, { email: 'a@b.com' });
```

Three behaviours to know:

- Consent transmits **even when the user is opted out** — a withdrawal has to reach the
  server.
- It goes to its own endpoint, unbatched.
- `Reject` opts out; `Accept` opts in. You do not need to call `optOut()` yourself.

### Opt in / out

```ts
await intempt.optOut();          // stops collection AND discards the queue
await intempt.optIn();
await intempt.hasOptedOut();
await intempt.isOptedIn();
```

`optOut()` discards events already collected. Setting a flag alone would leave events
gathered before the objection to be uploaded after it. Queued **consent** records are
preserved — they are the evidence of the decision.

### Recommendations

```ts
const products = await intempt.products({ feedId: 'feed-1', count: 10 });
```

Experiment and personalization assignment is **not** in the mobile SDKs — it is an
intemptjs capability. Recommendation feeds are a different thing and are here.

`products()` defaults `fields` to `productId`, `title`, `price`, `imageUrl`, `url`.

**Do not widen it by omission.** An unfielded request returns every catalog column
including raw ML embedding vectors — measured at **443x** the payload for the same ten
products, 503 bytes against 222,919. Ask for the columns your screen renders.

### Automatic events

```ts
await intempt.setAutomaticEvents({
  sessions: true,
  versionChanges: false,
  appStateChanges: false,
});
```

Only `sessions` is on by default. An SDK that silently emits events you never asked for
is how an event-volume bill surprises someone.

### Autocapture

Different from automatic events, and easy to confuse with them. Automatic events are
lifecycle facts the SDK already knows. **Autocapture hooks the view layer** — on iOS it
swizzles UIKit — so it installs nothing until you start it.

```ts
await intempt.autocapture.configure({
  screenViews: true,
  controlInteractions: true,
});
await intempt.autocapture.start();

await intempt.autocapture.isRunning();
await intempt.autocapture.stop();
```

`configure()` alone changes nothing. `start()` is the point at which instrumentation is
installed.

The two options map onto finer native ones. On iOS, `screenViews` covers screen
appearances and exits; `controlInteractions` covers button presses and value changes.
iOS's `rawTouches` is deliberately **not** exposed here — a tap on a control already emits
its own event, so enabling raw touches alongside it double-counts every button press.

### Push

```ts
await intempt.setPushToken(hexToken);
await intempt.trackPushOpen(notification.data);
await intempt.trackPushReceived(notification.data);
```

iOS: `setPushToken` takes the APNs token as a hex string, since `Data` has no bridge
representation.

Android: registration needs Google Play Services. **An emulator running the `default`
system image has none** — use a `google_apis` image, or token registration fails in a way
that is hard to read.

### Multiple instances

```ts
const eu = await init({ ...config, instanceName: 'eu' });
const us = await init({ ...config, instanceName: 'us' });
```

Each instance has its own credentials, queue and identity.

## Errors

Every rejection is an `IntemptError` with a `code`.

```ts
import { IntemptError, IntemptErrorCode } from 'intempt-react-native';

try {
  await intempt.track('e');
} catch (error) {
  if (error instanceof IntemptError) {
    if (error.isUnsupported) {
      // contract method not on this platform yet
    } else if (error.isRetryable) {
      // transport or 5xx; error.retryAfter may be set
    }
  }
}
```

A `401` is **terminal**, not retryable — a bad credential cannot succeed on retry. The
queued events are kept, because the data is valid and the integration is what is broken.

### Platform gaps

A contract method missing on one platform rejects with `unsupported_on_android` or
`unsupported_on_ios` plus the method name. It never resolves silently.

Currently unsupported on Android, pending `intempt-android` 3.0: `reset`,
`getProfileId`, `getSessionId`, `flush`, `getFlushInterval`, `setFlushInterval`,
`experiments`, `products`, `getAutomaticEvents`, `setAutomaticEvents`, the whole
`autocapture` object, `setPushToken`, `trackPushOpen`, `trackPushReceived`.

Android also ignores the credentials passed to `init()` until 3.0 — it reads
`android/app/src/main/assets/intempt-config.json`. `init()` fails loudly when that file
is absent rather than reporting success and sending events nowhere.

## The contract

This package implements
[`intempt-swift/docs/SDK-API-CONTRACT.md`](https://github.com/intempt/intempt-swift/blob/main/docs/SDK-API-CONTRACT.md),
the surface every Intempt client SDK conforms to. `docs/CONTRACT.md` beside it defines
the wire.

Conformance is enforced by a fixture corpus, not by review:

```sh
node scripts/check-corpus.mjs   # no dependencies; runs before npm install
npm run typecheck               # tsc
npm test                        # 57 tests
./scripts/typecheck-ios.sh      # the Swift bridge against the real SDK
```

`typecheck-ios.sh` resolves every Intempt symbol the bridge uses against an actual
`intempt-swift` build. It does **not** verify React Native itself — the promise blocks are
stubbed, so `@objc` export shape, the `RCT_EXTERN_METHOD` declarations, autolinking and
codegen still need a real `pod install` and an Xcode build.

Adding a method to the TurboModule spec without a fixture fails the build.

## Contributing

```sh
npm install
npm run typecheck
npm test               # 131 tests
npm run mutation       # Stryker; gate is 95, currently 99.03
./scripts/typecheck-ios.sh   # Swift bridge against the real SDK
```

**The package runs on Node 18+. The dev toolchain needs Node 22+** — Stryker
refuses anything older, which is how CI failed while it passed locally on 23.

Design and open questions: `docs/superpowers/specs/2026-08-15-intempt-reactnative-design.md`.

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE) — the package structure is
adapted from [mixpanel-react-native](https://github.com/mixpanel/mixpanel-react-native),
also Apache 2.0.
