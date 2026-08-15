#!/usr/bin/env bash
#
# Typecheck the iOS bridge against the REAL Intempt module.
#
# Why this exists: the bridge is Swift that no compiler sees until someone runs
# `pod install` in a host app and builds it in Xcode. That is a long feedback
# loop for the most common mistake here — calling an Intempt API that does not
# exist, or exists on a different type. One such bug shipped: the module called
# `Intempt.initialize(...)` when `initialize` is a static on `IntemptInstance`.
#
# What this does and does not cover:
#
#   COVERS   every Intempt symbol, type, method, argument label and enum case,
#            resolved against the actual SDK build rather than against a guess
#   DOES NOT cover React Native itself. RCTPromiseResolveBlock and friends are
#            stubbed, so @objc export shape, the RCT_EXTERN_METHOD declarations
#            in the .mm, autolinking and codegen are NOT verified here. Those
#            need a real pod install and an Xcode build.
#
# Verified by mutation rather than assumed: planting `Intempt.initialize`,
# a wrong argument label, and a non-existent enum case each turn it red.
#
# Usage:  scripts/typecheck-ios.sh [path-to-intempt-swift]

set -euo pipefail

SDK="${1:-$(cd "$(dirname "$0")/../.." && pwd)/intempt-swift}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -d "$SDK" ]; then
  echo "intempt-swift not found at: $SDK" >&2
  echo "pass its path as the first argument" >&2
  exit 2
fi

# Xcode's toolchain, not Command Line Tools — the sources use Swift 5.7+
# shorthand optional binding, which an older swiftc rejects as a syntax error.
if [ -d /Applications/Xcode.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

echo "building $SDK ..."
( cd "$SDK" && swift build )

BUILD="$SDK/.build/debug"
[ -d "$BUILD" ] || { echo "no build output at $BUILD" >&2; exit 1; }

# Stand-ins for the React Native symbols the bridge references. Only the shapes
# matter; React stays opaque so that Intempt resolution is what gets tested.
cat > "$WORK/React.swift" <<'STUB'
import Foundation
public typealias RCTPromiseResolveBlock = (Any?) -> Void
public typealias RCTPromiseRejectBlock = (String?, String?, Error?) -> Void
STUB

# `import React` would pull in the real framework, which is not present here.
sed 's/^import React$//' "$HERE/ios/IntemptReactNative.swift" > "$WORK/IntemptReactNative.swift"
cp "$HERE/ios/TypeBridge.swift" "$WORK/"

echo "typechecking the bridge against Intempt ..."
swiftc -typecheck -I "$BUILD/Modules" -I "$BUILD" "$WORK"/*.swift

echo "iOS typecheck OK — every Intempt symbol resolves"
