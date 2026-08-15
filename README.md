# intempt-react-native

Intempt SDK for React Native. Wraps [intempt-swift](https://github.com/intempt/intempt-swift)
on iOS and [intempt-android](https://github.com/intempt/intempt-android) on Android.

> **Not yet releasable.** One native prerequisite is outstanding — see
> [Status](#status). The JavaScript layer, the bridge contract and the test suite are
> complete and reviewable now.

## Status

| Piece | State |
|---|---|
| JavaScript / TypeScript layer | complete |
| TurboModule spec + codegen config | complete |
| Contract fixture corpus | complete, 30 fixtures over 26 methods |
| iOS native module | complete, builds against `Intempt` 0.1.0 |
| Android native module | complete, 13 methods reject until `intempt-android` 3.0 |
| iOS distribution | podspec and tag `v0.1.0` shipped; **not on CocoaPods trunk yet** |
| Android distribution | on Maven Central; needs 3.0 for full conformance |

## Install

```sh
npm install intempt-react-native
```

The iOS SDK is not on CocoaPods trunk yet, so add it from git in your `Podfile`:

```ruby
pod 'Intempt', :git => 'https://github.com/intempt/intempt-swift.git', :tag => 'v0.1.0'
```

```sh
cd ios && pod install
```

That line goes away once `Intempt` is pushed to trunk. The repository is public, so it
resolves without authentication.

No JavaScript dependencies. Everything this package needs is generated natively.

**Requirements:** React Native 0.76+, iOS 15.1+, Android API 24+.

## Quick start

```ts
import { init } from 'intempt-react-native';

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

### Personalization

```ts
import { OptimizationType } from 'intempt-react-native';

const choices = await intempt.experiments({
  names: ['hero-test'],
  optimizationType: OptimizationType.Experiment,
});

const products = await intempt.products({ feedId: 'feed-1', count: 10 });
```

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
`experiments`, `products`, `getAutomaticEvents`, `setAutomaticEvents`, `setPushToken`,
`trackPushOpen`, `trackPushReceived`.

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
npm test                        # the same invariant, plus behaviour
```

Adding a method to the TurboModule spec without a fixture fails the build.

## Contributing

```sh
npm install
npm run typecheck
npm test
```

Design and open questions: `docs/superpowers/specs/2026-08-15-intempt-reactnative-design.md`.

## License

Apache 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE) — the package structure is
adapted from [mixpanel-react-native](https://github.com/mixpanel/mixpanel-react-native),
also Apache 2.0.
