# Conventions

**The cross-SDK surface is not decided here.** Every Intempt SDK conforms to
`intempt-swift/docs/SDK-API-CONTRACT.md`, which is the single authority on method names, argument
order, defaults and what is deliberately withheld. This file covers what is specific to React Native and
to this repo. Where the two disagree, the contract wins and this file is the bug.

## The rules that come from the contract

- **`variation` reads flags only** (intempt-swift 0.7.0 / intempt-android 8.0.0, SDK-ALIGN D20).
  Experiments and personalizations are read with `choose()`, bridged to the native SDKs' own; an
  experiment key passed to `variation` returns the default.
- **`defaultValue` is part of every read.** It is what a caller receives on a network failure, a
  timeout, an unknown key or a malformed response. An SDK that throws when the service is
  unreachable takes the application down with it, which is the opposite of what a kill switch is for.
- **A wrong-typed value falls back; it is never coerced.** A flag configured as a string and read as
  a boolean returns the caller's default, not `true`. Coercion makes a misconfiguration look like a
  deliberate value.
- **`variationDetail` carries the reason** (`EXP-SERVE-001`): the `/flags` routes send one, and
  every read crosses the bridge as the native `variationDetail`, so a deliberate off state and an
  unanswered request are distinct (`off` vs `error` with an `errorCode`).
- **Evaluation is the server's.** No local rule engine and no hashing utility (the native SDKs keep
  only a 60 s answer cache):
  the server buckets, so no second implementation can disagree with it. `check-no-local-bucketing.mjs`
  enforces this in CI and a new bucketing helper fails the build.
- **A default object can come back as an equal copy.** When the native SDK answers a read with
  no error code (an `off` or `killed` flag), the value it returns is its copy of your default, so
  you get an equal object, not the same reference. Compare by value (accepted, Beso 2026-11-27).
- **A flag read never throws (S11, SDK-ALIGN 2026-11-27).** A bad key, context or default returns
  the default with `reason: 'error'` and an `errorCode`, exactly as the native SDKs answer; a 5xx is
  absorbed the same way. Only calling before `init()` rejects.

## Credentials

The `/flags/*` routes (`evaluate`, `all`, `expose`, `stream`) and `choose-api` accept the
**public** API key `init()` takes; audience-service's `PublicApiKeyDenyWebFilter` allows it on all
of them (verified 2026-11-27, SDK-ALIGN PLAN §3). A mobile app ships no server credential. Never
log the key, never put it in a URL.

## React Native specifics

- **The bridge is the surface.** A method the native Android or iOS SDK makes internal cannot be
  called from the bridge, and the failure lands in the example app's typecheck rather than in a unit
  test. When the native SDKs withhold something, the bridge and the example both have to follow.
- The example app is typechecked in CI. It is a gate, not a sample.
