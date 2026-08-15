# Changelog

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

- `Intempt` 0.1.0 is not on CocoaPods trunk yet, so consumers resolve it from
  git with an explicit `:tag`
- `intempt-android` reaches full conformance in 3.0; until then 13 methods
  reject with `unsupported_on_android` and `init()` cannot accept runtime
  credentials

### Not a gap, previously misreported

The 2026-08-11 audit with 58 findings was against `ios-source`
(`intempt/intempt-ios`), the deprecated Objective-C SDK — not against
`intempt-swift`. That audit is why `intempt-swift` exists. The real risk to
carry is that 0.1.0 is a first release with no production mileage, which is why
the podspec pins it exactly rather than with `~>`.
