#!/usr/bin/env bash
#
# End-to-end: run the bridge on a real iOS simulator against api.intempt.com.
#
# Everything else in this repo stops at a boundary. Unit tests stop at the
# bridge, the corpus stops at the arguments handed to native, and the compile
# jobs stop at "it links". This is the only check that runs JavaScript ->
# TurboModule -> native SDK -> HTTP and asserts the server accepted the event.
#
# No UI driver. The probe app prints `E2E|PASS|...` lines and this script reads
# them out of the simulator log, which avoids a Detox/Maestro dependency for
# what is fundamentally an assertion about network delivery.
#
# Credentials come from the environment (INTEMPT_API_KEY, INTEMPT_ORG_ID,
# INTEMPT_PROJECT_ID, INTEMPT_SOURCE_ID). When absent the probe SKIPS rather
# than fails, matching intempt-swift's live contract tests, so a fork without
# secrets still gets a green suite.
#
# Usage: scripts/run-e2e-ios.sh [workdir]

set -euo pipefail

PKG="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-$(mktemp -d)}"
APP="HostApp"
DEVICE_NAME="intempt-e2e"
# BUNDLE_ID is read from the BUILT app rather than assumed. It was hardcoded to
# com.hostapp, and the React Native template actually produces
# org.reactjs.native.example.HostApp — the build succeeded and the launch failed
# with FBSOpenApplicationServiceErrorDomain code 4, which reads like a simulator
# problem rather than a wrong identifier.

if [ -d /Applications/Xcode.app ]; then
  export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer
fi

echo "==> workdir: $WORK"
mkdir -p "$WORK" && cd "$WORK"

if [ ! -d "$APP" ]; then
  echo "==> scaffolding a bare React Native app"
  npx --yes @react-native-community/cli@latest init "$APP" \
    --version 0.81.0 --skip-install --install-pods false --pm npm
fi

cd "$APP"
echo "==> installing dependencies"
npm install

# Install from a PACKED TARBALL, not `npm install <path>`.
#
# A path install symlinks, and Metro does not resolve through symlinks without
# watchFolders — which is how this failed the first time, with "Unable to
# resolve module intempt-react-native" at the bundle step after pod install had
# already succeeded.
#
# The tarball is also the more honest test: `npm pack` honours the `files`
# allowlist, so this exercises exactly what a consumer downloads from npm. A
# file missing from `files` fails here rather than in someone's app.
echo "==> packing and installing the package as a consumer would get it"
TARBALL="$(cd "$PKG" && npm pack --silent --pack-destination "$WORK")"
npm install "$WORK/$TARBALL"

echo "==> installing the probe app"
cp "$PKG/e2e/App.e2e.tsx" App.tsx
# react-native-config would be another dependency for four strings; the babel
# transform inlines them at build time instead.
npm install --save-dev babel-plugin-transform-inline-environment-variables
cat > babel.config.js <<'BABEL'
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: [
    ['transform-inline-environment-variables', {
      include: [
        'INTEMPT_API_KEY',
        'INTEMPT_ORG_ID',
        'INTEMPT_PROJECT_ID',
        'INTEMPT_SOURCE_ID',
      ],
    }],
  ],
};
BABEL

echo "==> pod install"
cd ios
# Not on CocoaPods trunk yet; the repository is public so a tagged git
# reference resolves without credentials. Remove once `pod trunk push` runs.
if ! grep -q "pod 'Intempt'" Podfile; then
  printf "\npod 'Intempt', :git => 'https://github.com/intempt/intempt-swift.git', :tag => 'v0.1.0'\n" >> Podfile
fi
pod install
cd ..

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

echo "==> building for the simulator"
cd ios
xcodebuild -workspace "$APP.xcworkspace" -scheme "$APP" \
  -configuration Debug -destination "id=$DEVICE_ID" \
  -derivedDataPath build -quiet build
cd ..

APP_PATH="ios/build/Build/Products/Debug-iphonesimulator/$APP.app"
[ -d "$APP_PATH" ] || { echo "build produced no app at $APP_PATH" >&2; exit 1; }

echo "==> bundling JavaScript into the app"
# Without this the app expects a Metro server on launch and the probe never runs.
npx react-native bundle --platform ios --dev false \
  --entry-file index.js --bundle-output "$APP_PATH/main.jsbundle" \
  --assets-dest "$APP_PATH"

echo "==> installing and launching"
xcrun simctl install "$DEVICE_ID" "$APP_PATH"

BUNDLE_ID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP_PATH/Info.plist")"
[ -n "$BUNDLE_ID" ] || { echo "could not read CFBundleIdentifier from the built app" >&2; exit 1; }
echo "    bundle id: $BUNDLE_ID"

LOG="$WORK/e2e.log"
# Streaming starts before launch: the probe runs on mount and would otherwise
# finish before the stream attached.
xcrun simctl spawn "$DEVICE_ID" log stream --style compact --level debug \
  --predicate "processImagePath CONTAINS '$APP'" > "$LOG" 2>&1 &
LOG_PID=$!
sleep 3
trap 'kill $LOG_PID 2>/dev/null || true; xcrun simctl shutdown "$DEVICE_ID" >/dev/null 2>&1 || true' EXIT

xcrun simctl launch "$DEVICE_ID" "$BUNDLE_ID" \
  INTEMPT_API_KEY="${INTEMPT_API_KEY:-}" \
  INTEMPT_ORG_ID="${INTEMPT_ORG_ID:-}" \
  INTEMPT_PROJECT_ID="${INTEMPT_PROJECT_ID:-}" \
  INTEMPT_SOURCE_ID="${INTEMPT_SOURCE_ID:-}"

echo "==> waiting for the probe to finish"
for _ in $(seq 1 90); do
  grep -q 'E2E|DONE' "$LOG" 2>/dev/null && break
  sleep 2
done

echo
echo "==================== E2E RESULTS ===================="
grep -o 'E2E|[^"]*' "$LOG" | sed 's/^/  /' || true
echo "====================================================="

if grep -q 'E2E|SKIP|credentials' "$LOG"; then
  echo "SKIPPED — no credentials in the environment"
  exit 0
fi

DONE_LINE="$(grep -o 'E2E|DONE|[0-9]*|[0-9]*' "$LOG" | tail -1 || true)"
[ -n "$DONE_LINE" ] || { echo "probe never reported DONE — see $LOG" >&2; exit 1; }

PASSED="$(echo "$DONE_LINE" | cut -d'|' -f3)"
TOTAL="$(echo "$DONE_LINE" | cut -d'|' -f4)"
echo "e2e: $PASSED/$TOTAL passed"
[ "$PASSED" = "$TOTAL" ] && [ "$TOTAL" != "0" ]
