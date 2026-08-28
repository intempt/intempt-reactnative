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
