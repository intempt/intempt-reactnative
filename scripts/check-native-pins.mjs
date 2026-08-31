#!/usr/bin/env node
/**
 * Native pin gate — does the SHIPPED pin resolve to an artifact that can compile this bridge?
 *
 * A red check here means DO NOT SHIP, and it stays a standing gate after it first goes green:
 * every future pin move, and every SDK release that changes what a coordinate contains, is
 * measured by it.
 *
 * The failure it exists to prevent already happened, silently, across twelve green checks. Every
 * native CI job built this bridge against `feature/experiences-flags` of both SDKs — a pod from
 * a git branch, and an Android artifact republished into mavenLocal under the SAME coordinate
 * Maven Central serves, so `3.0.4` stopped denoting fixed bytes on any machine that had run that
 * job. `Android build`, `iOS build`, `iOS typecheck` and `E2E` were all green while the two
 * versions THIS PACKAGE SHIPPED could not compile a line of it. A consumer's first build was
 * `cannot find 'FlagContext' in scope`, and nothing in CI said so. Those overrides are gone;
 * this gate is what keeps them gone.
 *
 * So this gate ignores every override CI applies and asks only what a consumer's build asks:
 *
 *   1. Which version does the requirement in the shipped podspec / build.gradle actually select
 *      from the registry a consumer resolves from? (Trunk, and Maven Central. Not a branch, not
 *      mavenLocal.)
 *   2. Does THAT artifact contain the symbol this bridge calls?
 *
 * Step 2 is why this is a content check and not a version check. A version check needs someone to
 * guess the number each SDK will publish next and to keep a floor file in sync; this one needs
 * nothing kept in sync, cannot be satisfied by republishing different bytes under an old
 * coordinate, and turns green on the same day a consumer's build starts working.
 *
 * Zero dependencies, two small downloads (~310KB total). Runs before `npm install`, so a broken
 * dev tree cannot skip it.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// The symbol every flag call on both bridges goes through. Chosen because it is a TYPE: a
// release can rename a method and still compile the bridge, but it cannot lack this type and
// compile `FlagContext(userId:profileId:)` on either side.
const REQUIRED_SYMBOL = 'FlagContext';

const podspec = readFileSync(join(root, 'IntemptReactNative.podspec'), 'utf8');
const gradle = readFileSync(join(root, 'android/build.gradle'), 'utf8');

const podMatch = podspec.match(/s\.dependency\s+'Intempt',\s*'([^']+)'/);
const gradleMatch = gradle.match(
  /com\.intempt\.sdk:intempt-android:\$\{project\.findProperty\('intemptAndroidVersion'\)\s*\?:\s*'([^']+)'\}/
);
if (!podMatch) die("could not read the Intempt pod requirement out of IntemptReactNative.podspec");
if (!gradleMatch) die("could not read the intempt-android version out of android/build.gradle");

const podRequirement = podMatch[1];
const androidVersion = gradleMatch[1];

const parts = (v) => v.split('.').map((n) => Number.parseInt(n, 10) || 0);
function compare(a, b) {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * What CocoaPods would actually select for `requirement` out of `available`.
 *
 * Exact and optimistic pins only. Anything else throws rather than guessing, because a gate that
 * guesses at a version requirement reports a resolution nobody gets.
 */
function resolvePod(requirement, available) {
  if (/^\d+(\.\d+)*$/.test(requirement)) {
    return available.includes(requirement) ? requirement : null;
  }
  const optimistic = requirement.match(/^~>\s*(\d+(?:\.\d+)*)$/);
  if (optimistic) {
    const floor = optimistic[1];
    const ceiling = parts(floor).slice(0, -1);
    ceiling[ceiling.length - 1] += 1;
    const matches = available
      .filter((v) => compare(v, floor) >= 0 && compare(v, ceiling.join('.')) < 0)
      .sort(compare);
    return matches.length ? matches[matches.length - 1] : null;
  }
  throw new Error(
    `unsupported pod requirement ${JSON.stringify(requirement)} — this gate reads exact ` +
      `('0.2.0') and optimistic ('~> 0.2') pins only`
  );
}

async function bytes(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

/** Whether `symbol` appears anywhere in a gzipped tar or a zip, without unpacking to disk twice. */
function archiveContains(buffer, kind, symbol) {
  const dir = mkdtempSync(join(tmpdir(), 'intempt-pins-'));
  try {
    const file = join(dir, kind === 'tgz' ? 'a.tgz' : 'a.zip');
    writeFileSync(file, buffer);
    const out =
      kind === 'tgz'
        ? execFileSync('tar', ['xzOf', file], { maxBuffer: 1 << 28 })
        : execFileSync('unzip', ['-p', file], { maxBuffer: 1 << 28 });
    return out.includes(symbol);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function die(...lines) {
  console.error('native pin check FAILED');
  for (const line of lines.flat()) console.error(`  - ${line}`);
  console.error(
    '\n  This gate measures the artifacts a CONSUMER resolves — CocoaPods trunk and Maven\n' +
      '  Central — and never a branch or a mavenLocal publish. A version number is not\n' +
      '  evidence: it downloads what the pin selects and looks for the symbol.\n' +
      '\n' +
      '  DO NOT TAG A RELEASE WHILE THIS IS RED. The pins that ship cannot compile this bridge,\n' +
      '  and a consumer\'s first build fails with "cannot find \'FlagContext\' in scope".\n' +
      '\n' +
      '  To clear it: move the pin in IntemptReactNative.podspec and android/build.gradle to a\n' +
      '  PUBLISHED version that contains the surface, and make sure no CI override is standing\n' +
      '  in for one (.github/workflows/ci.yml, scripts/run-e2e-ios.sh). As of 2026-08-31 that is\n' +
      '  Intempt 0.2.0 on trunk and com.intempt.sdk:intempt-android:3.1.0 on Maven Central.'
  );
  process.exit(1);
}

const trunk = await (await fetch('https://trunk.cocoapods.org/api/v1/pods/Intempt')).json();
const podVersions = (trunk.versions ?? []).map((v) => v.name);

const metadata = await (
  await fetch('https://repo1.maven.org/maven2/com/intempt/sdk/intempt-android/maven-metadata.xml')
).text();
const mavenVersions = [...metadata.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);

const problems = [];

// ---- iOS ----------------------------------------------------------------------------------
const resolvedPod = resolvePod(podRequirement, podVersions);
if (resolvedPod === null) {
  problems.push(
    `IntemptReactNative.podspec pins Intempt '${podRequirement}', which resolves to NOTHING on ` +
      `CocoaPods trunk. Trunk serves: ${podVersions.join(', ')}. A consumer's \`pod install\` ` +
      `fails outright — which is the loud failure this pin exists to produce, not a bug in it.`
  );
} else {
  const tarball = await bytes(
    `https://codeload.github.com/intempt/intempt-swift/tar.gz/refs/tags/v${resolvedPod}`
  );
  if (!tarball) {
    problems.push(`could not download intempt-swift source for tag v${resolvedPod}`);
  } else if (!archiveContains(tarball, 'tgz', REQUIRED_SYMBOL)) {
    problems.push(
      `Intempt '${podRequirement}' resolves to ${resolvedPod} on CocoaPods trunk, and the ` +
        `source for v${resolvedPod} contains no \`${REQUIRED_SYMBOL}\`. That is the release a ` +
        `consumer builds against, and it cannot compile ios/IntemptReactNative.swift.`
    );
  }
}

// ---- Android ------------------------------------------------------------------------------
if (!mavenVersions.includes(androidVersion)) {
  problems.push(
    `android/build.gradle pins com.intempt.sdk:intempt-android:${androidVersion}, which is NOT ` +
      `on Maven Central. Central serves: ${mavenVersions.join(', ')}`
  );
} else {
  const jar = await bytes(
    `https://repo1.maven.org/maven2/com/intempt/sdk/intempt-android/${androidVersion}/` +
      `intempt-android-${androidVersion}-sources.jar`
  );
  if (!jar) {
    problems.push(`could not download intempt-android ${androidVersion} sources jar`);
  } else if (!archiveContains(jar, 'zip', REQUIRED_SYMBOL)) {
    problems.push(
      `com.intempt.sdk:intempt-android:${androidVersion} is published, and its sources jar ` +
        `contains no \`${REQUIRED_SYMBOL}\`. That is the artifact a consumer resolves. Do not ` +
        `answer this by republishing different bytes under the same coordinate, or by shadowing ` +
        `it from mavenLocal in CI — both were tried, and this gate exists because they passed.`
    );
  }
}

if (problems.length) die(problems);

console.log(
  `native pins OK — Intempt '${podRequirement}' resolves to ${resolvedPod} and its source ` +
    `carries ${REQUIRED_SYMBOL}; intempt-android ${androidVersion} is published and its sources ` +
    `carry ${REQUIRED_SYMBOL}.`
);
