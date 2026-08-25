#!/usr/bin/env bash
#
# End-to-end: run the committed Expo example app on a simulator, against the
# live API, and read its results from a file.
#
# Everything else in this repo stops at a boundary. Unit tests stop at the
# bridge, the corpus stops at the arguments handed to native, the compile jobs
# stop at "it links". This runs JavaScript -> TurboModule -> native SDK -> HTTP
# -> api.intempt.com and asserts the server accepted the events.
#
# WHY THE APP IS COMMITTED RATHER THAN SCAFFOLDED PER RUN
#
# The previous harness scaffolded a bare React Native app at CI time and copied
# a probe into it. That app could not depend on a filesystem module, so the
# probe's only reporting channel was console.log — and console.log does not
# reach os_log in a `--dev false` bundle. CI captured nothing while the app ran
# perfectly. Two strategies were tried, `log stream` and `log show`; both came
# back empty, and the second ruled out timing and identified the channel.
#
# example/ can depend on expo-file-system, so the probe writes a file and this
# script reads it with `simctl get_app_container` afterwards. No streaming, no
# race — and the same app is something a developer can open and run by hand,
# which is what Android's :sample and intempt-swift's IntemptDemo already are.
#
# Credentials come from EXPO_PUBLIC_INTEMPT_* in the environment. Absent, the
# app writes a SKIP result and this exits 0, so a fork without secrets still
# gets a green suite — matching intempt-swift's live contract tests.
#
# Usage: scripts/run-e2e-ios.sh [workdir]

set -euo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d)}"
DEVICE_NAME="intempt-e2e"
BUNDLE_ID="com.intempt.example"
RESULTS_FILE="intempt-e2e-results.txt"

if [ -d /Applications/Xcode.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

echo "==> preparing the example app in $WORK"
mkdir -p "$WORK"
cp -R "$PKG/example/." "$WORK/"
cd "$WORK"

# The example depends on the package as `file:..`, which points outside this
# copy. Repoint it at a packed tarball so the app consumes exactly what a
# consumer downloads from npm — a `main` that pointed at a non-existent file was
# caught this way once already.
echo "==> packing the SDK and pointing the example at it"
TARBALL="$(cd "$PKG" && npm pack --silent --pack-destination "$WORK")"
node -e "
  const fs = require('fs');
  const p = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  p.dependencies['intempt-react-native'] = 'file:./$TARBALL';
  fs.writeFileSync('package.json', JSON.stringify(p, null, 2));
"

echo "==> installing dependencies"
npm install --no-audit --no-fund

echo "==> expo prebuild (generates the native iOS project)"
npx expo prebuild --platform ios --clean --no-install
# Point the Intempt pod at the intempt-swift ref this bridge is built against.
#
# The bridge calls FlagContext, variationDetail and allFlags. The published pod
# (0.1.0 on CocoaPods trunk) predates all three, so a plain `pod install` builds
# against a release that cannot compile the code under test — which is exactly how
# this job failed with "cannot find 'FlagContext' in scope" at
# IntemptReactNative.swift:456 and :483.
#
# ios-build in ci.yml does the same thing for the bare host app; INTEMPT_SWIFT_REF
# is set at workflow level so both move together. Remove once intempt-swift
# publishes a release containing the flag surface.
SWIFT_REF="${INTEMPT_SWIFT_REF:-feature/experiences-flags}"
printf "\npod 'Intempt', :git => 'https://github.com/intempt/intempt-swift.git', :branch => '%s'\n" \
  "$SWIFT_REF" >> ios/Podfile
grep -q "intempt-swift.git" ios/Podfile || { echo "Intempt pod override not appended to ios/Podfile"; exit 1; }

( cd ios && pod install )

echo "==> preparing a simulator"
RUNTIME="$(xcrun simctl list runtimes --json | python3 -c "
import json,sys
rs=[r for r in json.load(sys.stdin)['runtimes'] if r['isAvailable'] and 'iOS' in r['name']]
print(sorted(rs, key=lambda r: r['version'])[-1]['identifier'] if rs else '')
")"
[ -n "$RUNTIME" ] || { echo "no iOS simulator runtime available" >&2; exit 2; }

xcrun simctl delete "$DEVICE_NAME" >/dev/null 2>&1 || true
DEVICE_ID="$(xcrun simctl create "$DEVICE_NAME" 'iPhone 16' "$RUNTIME")"
xcrun simctl boot "$DEVICE_ID"
xcrun simctl bootstatus "$DEVICE_ID" -b
trap 'xcrun simctl shutdown "$DEVICE_ID" >/dev/null 2>&1 || true' EXIT

SCHEME="$(basename "$(ls -d ios/*.xcworkspace | head -1)" .xcworkspace)"
echo "==> building $SCHEME"
(
  cd ios
  xcodebuild -workspace "$SCHEME.xcworkspace" -scheme "$SCHEME" \
    -configuration Debug -destination "id=$DEVICE_ID" \
    -derivedDataPath build -quiet build
)

APP_PATH="$(find ios/build/Build/Products -maxdepth 3 -name '*.app' | head -1)"
[ -d "$APP_PATH" ] || { echo "build produced no .app" >&2; exit 1; }

echo "==> bundling JavaScript into the app"
# Without this the app expects a Metro server on launch and the probe never runs.
npx expo export:embed --platform ios --dev false \
  --entry-file index.js --bundle-output "$APP_PATH/main.jsbundle" \
  --assets-dest "$APP_PATH" >/dev/null

echo "==> installing and launching"
xcrun simctl install "$DEVICE_ID" "$APP_PATH"
xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" >/dev/null

echo "==> waiting for the results file"
RESULTS=""
for _ in $(seq 1 60); do
  CONTAINER="$(xcrun simctl get_app_container "$DEVICE_ID" "$BUNDLE_ID" data 2>/dev/null || true)"
  if [ -n "$CONTAINER" ] && [ -f "$CONTAINER/Documents/$RESULTS_FILE" ]; then
    RESULTS="$(cat "$CONTAINER/Documents/$RESULTS_FILE")"
    break
  fi
  sleep 3
done

echo
echo "==================== E2E RESULTS ===================="
if [ -n "$RESULTS" ]; then echo "$RESULTS" | sed 's/^/  /'; else echo "  (none)"; fi
echo "====================================================="

[ -n "$RESULTS" ] || { echo "the app never wrote $RESULTS_FILE" >&2; exit 1; }

if echo "$RESULTS" | grep -q 'E2E|SKIP|credentials'; then
  echo "SKIPPED — no credentials in the environment"
  exit 0
fi

DONE_LINE="$(echo "$RESULTS" | grep -oE 'E2E\|DONE\|[0-9]+\|[0-9]+' | tail -1 || true)"
[ -n "$DONE_LINE" ] || { echo "no DONE marker in the results" >&2; exit 1; }

PASSED="$(echo "$DONE_LINE" | cut -d'|' -f3)"
TOTAL="$(echo "$DONE_LINE" | cut -d'|' -f4)"
echo "e2e: $PASSED/$TOTAL passed"
[ "$PASSED" = "$TOTAL" ] && [ "$TOTAL" != "0" ]
