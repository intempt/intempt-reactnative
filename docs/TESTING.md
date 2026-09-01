# Testing

## Gates, as CI actually runs them

| Gate | Command |
|---|---|
| Tests | `npm test` |
| Mutation | `npm run mutation` — **Stryker, break at 95 — set after measuring** |

**The mutation gate is the real bar, not coverage.** Coverage says a line executed; mutation says an
assertion would have noticed if that line were wrong. A test asserting a value that was already true
before the code ran executes the line and kills no mutant.

## Rules

- **A test that has never failed has never been tested.** Before trusting a new one, break the line
  it covers and watch it go red.
- **Assert a deliberate absence too.** A branch meant to do nothing — an ignored header, a producer
  that must not earn a widening — is exactly what a mutant flips without any existing test noticing.
- **Read the score from CI, never locally.** Local toolchains drift from CI's, and a timed-out mutant
  is counted as killed, so a loaded machine reports a higher score than the truth.
- **The lockfile is part of the diff.** An unpinned install regenerates it and turns a 900-line
  change into a 9,000-line one, which is how a real review gets skipped.

## What the mutation gate does NOT cover

**Stryker mutates `src/**/*.ts` and nothing else. It cannot reach a single line of the native
bridges.** Read the gate as a true statement about the TypeScript layer and as *no* statement at all
about Kotlin or Swift.

| Layer | Files | Lines added by the flag surface | Mutated? | In any unit test? |
|---|---|---|---|---|
| TypeScript | `src/index.ts`, `src/types.ts`, `src/NativeIntempt.ts` | 136 | ✅ `src/**/*.ts`, less the spec | ✅ jest |
| Kotlin | `android/**/*.kt` | 164 | ❌ | ❌ |
| Swift / ObjC++ | `ios/*.swift`, `ios/*.mm` | 87 | ❌ | ❌ |

Counts read from `git diff --numstat origin/main` on the branch that added the flag surface. They
drift as the branch moves; re-run that command rather than trusting these three numbers.

**Widening `mutate` is not the fix, because it is not possible.** Stryker is a JavaScript mutation
framework: it parses TypeScript and JavaScript and has no Kotlin or Swift mutator. Covering the
native halves needs a different tool per platform (PIT for the JVM, `muter` for Swift), each of
which needs that platform's test suite to exist first — and neither bridge is in a suite today.

**So this is what actually watches the native code:**

- `__tests__/setup.ts` **mocks the native module**, so no jest test reaches either bridge. A JS test
  passing says the TypeScript called the right method name with the right arguments. It says
  nothing about what the bridge then did with them.
- `Android build` and `iOS build` prove the bridges **compile**. Not what they return.
- `E2E (simulator, live API)` is the only job that executes a real bridge, and **it is iOS only**.
  There is no Android runtime job. Anything Kotlin-specific — type marshalling, promise semantics —
  is unobserved by every gate in this repo.

Two of the most consequential defects found in review of the flag surface (Android rejecting where
iOS resolves; Kotlin `toString()` mangling an object payload) lived entirely inside those unmutated,
untested native lines, and every gate was green. That is the size of this hole, stated so nobody
reads a green `Mutation testing` badge as coverage of this package.

### Known equivalent-mutant risk

`waitForInitialization` is `void timeoutMs; return Promise.resolve();` and its test asserts
`resolves.toBeUndefined()`. **A block-removal mutant on a function whose entire observable behaviour
is "resolves with undefined" cannot be distinguished by that assertion.** If the score moves when
this method changes, treat it as a third equivalent mutant beyond the two `stryker.conf.json`
documents rather than as a regression. CI reports the gate green today, so this costs nothing now;
it is written down because the rule above — a test that has never failed has never been tested — is
in this same file.
