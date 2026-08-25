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
const contract = JSON.parse(
  readFileSync(join(root, '__tests__/fixtures/contract-methods.json'), 'utf8')
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

// `initialize` is module-level rather than an instance method, and diagnostics
// carry no contract obligation. Both are exercised by index.test.ts rather than
// by a corpus fixture.
const diagnostics = new Set(Object.keys(contract.diagnostics ?? {}));
const NON_INSTANCE = new Set(['initialize', ...diagnostics]);
const excluded = new Set(Object.keys(corpus.excludedFromBridge ?? {}));

const expected = specMethods.filter((m) => !NON_INSTANCE.has(m) && !excluded.has(m));
const covered = new Set(corpus.methods.map((m) => m.native.fn));

const missing = expected.filter((m) => !covered.has(m));
const unknown = [...covered].filter((m) => !specMethods.includes(m));

const problems = [];
if (specMethods.length === 0) {
  problems.push('parsed 0 methods off the spec — the regex no longer matches the file');
}

// contract -> spec. This is the direction the gate was missing: the corpus
// check below only proves the spec is fully fixtured, which stays green when a
// contract method is never bridged at all. Autocapture was added to the
// contract and shipped absent from this package with the gate passing.
const contractMethods = Object.keys(contract.methods);
const unbridged = contractMethods.filter(
  (m) => !specMethods.includes(m) && !excluded.has(m)
);
if (unbridged.length) {
  problems.push(
    `contract methods absent from the TurboModule spec: ${unbridged.join(', ')}`
  );
}

// excludedFromBridge is an escape hatch, so it needs a reverse check or it
// becomes a place to hide a genuinely missing method. A contract method excused
// from the bridge must still be implemented in the JS layer — that is the whole
// claim being made about it. Without this, adding a name to excludedFromBridge
// silently deletes its coverage.
const jsLayer = readFileSync(join(root, 'src/index.ts'), 'utf8');
const unimplemented = contractMethods.filter(
  (m) =>
    excluded.has(m) &&
    !new RegExp(`^\\s+(async\\s+)?${m}\\s*[(<]`, 'm').test(jsLayer)
);
if (unimplemented.length) {
  problems.push(
    `excluded from the bridge but not implemented in src/index.ts either: ` +
      `${unimplemented.join(', ')}`
  );
}

// And every exclusion states why, so the next reader can judge it.
const unexplained = [...excluded].filter(
  (m) => !String(corpus.excludedFromBridge[m] ?? '').trim()
);
if (unexplained.length) {
  problems.push(`excludedFromBridge entries with no reason: ${unexplained.join(', ')}`);
}

// And the reverse, so the spec cannot grow a method the contract never agreed
// to. A bridge method with no contract entry is drift in the other direction.
const undocumented = specMethods.filter(
  (m) => !contractMethods.includes(m) && !diagnostics.has(m)
);
if (undocumented.length) {
  problems.push(
    `spec methods with no contract entry: ${undocumented.join(', ')} ` +
      `(add to contract-methods.json methods, or to its diagnostics section)`
  );
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
  `corpus check OK — ${contractMethods.length} contract methods, ` +
    `${specMethods.length} bridged, ${expected.length} require fixtures, ` +
    `${corpus.methods.length} fixtures, ${excluded.size} documented exclusion(s)`
);
