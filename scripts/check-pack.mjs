#!/usr/bin/env node
/**
 * Verify the published tarball contains everything package.json points at.
 *
 * Why: `main` said `lib/commonjs/index.js` and the build only produced
 * `lib/module/`. Nothing caught it. Not tsc, not jest, not the corpus gate, not
 * either native build — because every one of those reads the SOURCE tree, where
 * the file it needs is right there. Only `npm pack` sees what a consumer gets,
 * and the failure would have surfaced as "module not found" in someone else's
 * app after publishing.
 *
 * `npm pack --dry-run --json` reports the file list without writing a tarball,
 * so this is cheap enough to run on every push.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

// Every field that resolves to a file a consumer will load.
const ENTRY_FIELDS = ['main', 'module', 'types', 'typings', 'react-native', 'source'];

let listed;
try {
  const out = execFileSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  listed = new Set(JSON.parse(out)[0].files.map((f) => f.path));
} catch (error) {
  console.error('could not run `npm pack --dry-run`:', error.message);
  process.exit(1);
}

const problems = [];

for (const field of ENTRY_FIELDS) {
  const target = pkg[field];
  if (!target) continue;
  const path = target.replace(/^\.\//, '');
  if (!listed.has(path)) {
    problems.push(
      `package.json "${field}" points at ${path}, which is NOT in the tarball`
    );
  }
}

// The native halves are useless to a consumer if they are not shipped.
for (const required of [
  'IntemptReactNative.podspec',
  'react-native.config.js',
  'android/build.gradle',
  'LICENSE',
  'NOTICE',
]) {
  if (!listed.has(required)) {
    problems.push(`${required} is missing from the tarball`);
  }
}

// A podspec that ships without the sources it declares produces a pod that
// compiles nothing.
const hasIosSource = [...listed].some((f) => f.startsWith('ios/') && /\.(swift|mm|m|h)$/.test(f));
if (!hasIosSource) {
  problems.push('no iOS sources in the tarball, but the podspec declares ios/**');
}

const hasAndroidSource = [...listed].some((f) => f.startsWith('android/src/') && f.endsWith('.kt'));
if (!hasAndroidSource) {
  problems.push('no Android sources in the tarball');
}

if (problems.length) {
  console.error('pack check FAILED');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\n  run `npm run build` if the lib/ output is stale');
  process.exit(1);
}

console.log(
  `pack check OK — ${listed.size} files, ` +
    `${ENTRY_FIELDS.filter((f) => pkg[f]).length} entry points all present`
);
