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

### Known gaps

- `intempt-swift` has no podspec, no git tags and no CocoaPods pod, so the iOS
  half cannot be built by a consumer yet
- `intempt-android` reaches full conformance in 3.0; until then 13 methods
  reject with `unsupported_on_android` and `init()` cannot accept runtime
  credentials
