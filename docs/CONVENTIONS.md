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
- **A flag read never throws (S11, SDK-ALIGN 2026-11-27).** A bad key, context or default returns
  the default with `reason: 'error'` and an `errorCode`, exactly as the native SDKs answer; a 5xx is
  absorbed the same way. Only calling before `init()` rejects.

## Credentials

The evaluation endpoint requires a **server** credential, sent as HTTP **Basic** — not Bearer. A
public key holds users and accounts and nothing else, and the response describes how every
experience in the project targets, so a public key is refused there. Never log it, never put it in a
URL.

> **OPEN — `EXP-SERVE-004` (C) versus a React Native bundle. Not settled in this repo.**
>
> `EXP-SERVE-004` requires a server credential on the SDK-surface evaluation endpoint, and its
> stated rationale is that *"the key held by a customer's backend is the credential."* **A mobile
> binary is not a backend.** Shipping a server credential in an IPA or an APK defeats the
> requirement's own reasoning; evaluating with the public key `initialize()` already takes
> contradicts its text. Spec §3.1 puts a mobile app in the SDK row explicitly, so this is the
> endpoint RN flags evaluate against and the conflict is real, not hypothetical.
>
> **This is a PO ruling, not an SDK repo's call, and it is not resolved here.** Owner: Sid.
> Enforcement is presumably at the gateway and has not been read —
> `audience-service`'s `SecurityConfiguration` declares no filter chain matching `choose-api` and
> `ExperienceChooserHandler.chooseApi` performs no credential-class check. Do not pick a side in
> this file; the requirement or the mobile path changes, and whichever it is happens upstream.

## React Native specifics

- **The bridge is the surface.** A method the native Android or iOS SDK makes internal cannot be
  called from the bridge, and the failure lands in the example app's typecheck rather than in a unit
  test. When the native SDKs withhold something, the bridge and the example both have to follow.
- The example app is typechecked in CI. It is a gate, not a sample.
