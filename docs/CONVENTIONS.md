# Conventions

**The cross-SDK surface is not decided here.** Every Intempt SDK conforms to
`intempt-swift/docs/SDK-API-CONTRACT.md`, which is the single authority on method names, argument
order, defaults and what is deliberately withheld. This file covers what is specific to React Native and
to this repo. Where the two disagree, the contract wins and this file is the bug.

## The rules that come from the contract

- **A caller asks for a KEY, never a mode.** The platform resolves whether a key is an experiment, a
  personalization or a flag; its serving query filters on channel and status and never on mode. A
  method name that encodes the mode forces an integrator to know the answer before they can ask the
  question, and grows combinatorially with every mode added.
- **`defaultValue` is REQUIRED, everywhere.** It is what a caller receives on a network failure, a
  timeout, an unknown key or a malformed response. An SDK that throws when the service is
  unreachable takes the application down with it, which is the opposite of what a kill switch is for.
- **A wrong-typed value falls back; it is never coerced.** A flag configured as a string and read as
  a boolean returns the caller's default, not `true`. Coercion makes a misconfiguration look like a
  deliberate value.
- **`variationDetail` is NOT exposed — and that is `EXP-SERVE-001` pending at the platform, not a
  closed decision.** It would carry a reason, and the serving response does not send one:
  `audience-service`'s `ExperienceApiChoose` carries `name`, `group` and `body` and nothing else,
  so the method could only report "off" for a person who was in fact targeted and served, which is
  the single thing such a method exists to tell you. Do not re-add it against today's wire, and do
  not document it on a docs page.

  **What this repo owes, stated plainly.** `EXP-SERVE-001` (H) says *"the evaluation response
  carries a reason, so a caller can distinguish a deliberate off state from a request the service
  did not answer — an absent entry must not be the encoding of both."* `EXP-SERVE-005` (H) says the
  same from the other side and is scenario-covered at S28. **This SDK encodes both as absent at all
  three layers**, because there is nothing else it can decode. The requirement is unmet here and the
  platform half is where it gets met.

  `variation` returns `Promise<T>`, so there is no channel a reason can arrive on later. **When the
  platform sends a reason, closing `EXP-SERVE-001` in this SDK is a BREAKING MAJOR**, not an
  additive change — the return shape has to widen. Recorded rather than pre-reserved: the return
  shape is set by `intempt-swift/docs/SDK-API-CONTRACT.md`, and this repo does not get to reserve a
  field in a cross-SDK contract on its own.
- **Evaluation is REMOTE only.** No local rule engine, no flag store to poll, and no hashing utility:
  the server buckets, so no second implementation can disagree with it. `check-no-local-bucketing.mjs`
  enforces this in CI and a new bucketing helper fails the build.
- **A validation mistake throws; a service problem does not.** A blank key or a missing default is a
  programming error the caller can fix, so it fails loudly at the call site. A 5xx is absorbed.

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
