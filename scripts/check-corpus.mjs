#!/usr/bin/env node
/**
 * Corpus completeness gate.
 *
 * Runs with no dependencies, so it works in CI before `npm install` and on a
 * machine that cannot afford to install React Native's dev tree.
 *
 * Asserts the invariant that makes the corpus a gate rather than a sample:
 * every method on the TurboModule spec has at least one fixture, and every
 * fixture names a method the spec actually has.
 *
 * The jest suite asserts the same thing at runtime. This exists because the
 * jest suite cannot run without node_modules, and a conformance gate that only
 * runs in a fully installed environment is one that gets skipped.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const corpus = JSON.parse(
  readFileSync(join(root, '__tests__/fixtures/contract-corpus.json'), 'utf8')
);
const spec = readFileSync(join(root, 'src/NativeIntempt.ts'), 'utf8');

// Methods declared on the Spec interface. Matches `name(` at an indented line
// start, which is how every declaration in that file is written.
const specBody = spec.slice(spec.indexOf('export interface Spec'));
const specMethods = [
  ...new Set(
    [...specBody.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*\(/gm)].map((m) => m[1])
  ),
];

// initialize and getSdkVersion are module-level, not instance methods, so they
// are exercised by index.test.ts rather than by a corpus fixture.
const NON_INSTANCE = new Set(['initialize', 'getSdkVersion']);
const excluded = new Set(Object.keys(corpus.excludedFromBridge ?? {}));

const expected = specMethods.filter((m) => !NON_INSTANCE.has(m) && !excluded.has(m));
const covered = new Set(corpus.methods.map((m) => m.native.fn));

const missing = expected.filter((m) => !covered.has(m));
const unknown = [...covered].filter((m) => !specMethods.includes(m));

const problems = [];
if (specMethods.length === 0) {
  problems.push('parsed 0 methods off the spec — the regex no longer matches the file');
}
if (missing.length) {
  problems.push(`spec methods with no fixture: ${missing.join(', ')}`);
}
if (unknown.length) {
  problems.push(`fixtures naming a method the spec lacks: ${unknown.join(', ')}`);
}

// Every fixture must state the instance name as its first native argument.
for (const [i, fixture] of corpus.methods.entries()) {
  if (fixture.native.args[0] !== corpus.instanceName) {
    problems.push(
      `fixture ${i} (${fixture.method}) does not pass the instance name first`
    );
  }
}

if (problems.length) {
  console.error('corpus check FAILED');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `corpus check OK — ${specMethods.length} spec methods, ` +
    `${expected.length} require fixtures, ${corpus.methods.length} fixtures, ` +
    `${excluded.size} documented exclusion(s)`
);
