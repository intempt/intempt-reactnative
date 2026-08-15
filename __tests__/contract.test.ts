/**
 * Conformance tests, driven by the fixture corpus.
 *
 * The corpus is the executable form of the SDK API contract. These tests prove
 * the JavaScript layer forwards each contract method with exactly the arguments
 * the contract specifies. The same corpus is asserted against the wire in the
 * SDK repos.
 */

import corpus from './fixtures/contract-corpus.json';
import { nativeCalls, resetNative } from './setup';
import {
  init,
  IntemptInstance,
  __resetInstanceRegistryForTests,
} from '../src/index';
import type { Spec } from '../src/NativeIntempt';

/**
 * Rehydrates the JSON encodings the corpus uses for values JSON cannot hold.
 *
 * `{"$date": "..."}` becomes a Date, `{"$undefined": true}` becomes undefined.
 * Without this the Date and undefined fixtures would be testing strings and
 * objects instead of the cases they name.
 */
function rehydrate(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(rehydrate);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.$date === 'string') {
      return new Date(record.$date);
    }
    if (record.$undefined === true) {
      return undefined;
    }
    return Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, rehydrate(v)])
    );
  }
  return value;
}

/** Contract methods that exist on the native spec but not as instance methods. */
const NON_INSTANCE_METHODS = new Set(['initialize', 'getSdkVersion']);

async function freshInstance(): Promise<IntemptInstance> {
  __resetInstanceRegistryForTests();
  const instance = await init({
    apiKey: 'prefix.secret',
    orgId: 'org-1',
    projectId: 'proj-1',
    sourceId: 'src-1',
  });
  resetNative();
  return instance;
}

describe('contract corpus', () => {
  it.each(corpus.methods.map((m, i) => [i, m.method, m] as const))(
    'fixture %i — %s forwards the contract arguments',
    async (_index, _method, fixture) => {
      const instance = await freshInstance();

      const args = (fixture.js.args as unknown[]).map(rehydrate);

      // `js.fn` may be a dotted path — `autocapture.configure` — because the
      // contract groups autocapture under its own object rather than flattening
      // it onto the instance.
      const path = fixture.js.fn.split('.');
      const receiver = path
        .slice(0, -1)
        .reduce<Record<string, unknown>>(
          (obj, key) => obj[key] as Record<string, unknown>,
          instance as unknown as Record<string, unknown>
        );
      const callable = receiver[path[path.length - 1]!];

      expect(typeof callable).toBe('function');

      await (callable as (...a: unknown[]) => Promise<unknown>).apply(
        receiver,
        args
      );

      expect(nativeCalls).toHaveLength(1);
      expect(nativeCalls[0]!.fn).toBe(fixture.native.fn);
      expect(nativeCalls[0]!.args).toEqual(fixture.native.args);
    }
  );
});

describe('corpus completeness', () => {
  /**
   * Guards against a contract method being added without a fixture.
   *
   * This is the test that makes the corpus a gate rather than a sample. It
   * reads the method list off the native spec's shape, so a method added to
   * NativeIntempt.ts with no fixture fails here.
   */
  it('covers every method on the native spec', async () => {
    const instance = await freshInstance();

    const covered = new Set(corpus.methods.map((m) => m.native.fn));
    const excluded = new Set(Object.keys(corpus.excludedFromBridge));

    // The spec's own key list, taken from the recorder the setup installs.
    const nativeModule = (await import('../src/NativeIntempt')).default as Spec;
    const specMethods = Object.keys(nativeModule).filter(
      (name) => !NON_INSTANCE_METHODS.has(name) && !excluded.has(name)
    );

    const missing = specMethods.filter((name) => !covered.has(name));
    expect(missing).toEqual([]);

    // And nothing in the corpus references a method the spec does not have.
    const unknown = [...covered].filter((name) => !specMethods.includes(name));
    expect(unknown).toEqual([]);

    expect(instance.name).toBe('default');
  });

  it('documents why anything is excluded from the bridge', () => {
    for (const [method, reason] of Object.entries(corpus.excludedFromBridge)) {
      expect(typeof reason).toBe('string');
      // A one-word "n/a" is not a reason. Exclusions are permanent API
      // decisions and have to survive someone reading them in a year.
      expect(reason.length).toBeGreaterThan(40);
      expect(method).toBe('doNotCaptureText');
    }
  });
});
