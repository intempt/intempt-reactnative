/**
 * allFlags exposure (PLAN-ROWS F32, SDK-ALIGN ruling 2026-11-27).
 *
 * intempt-swift 0.7.0 and intempt-android 8.0.0 record a flag's exposure when a value is READ
 * from the map allFlags returns. A bridge that copies that map into a JS object reads every value
 * and so exposes every flag the person was served, which dilutes every experiment behind them.
 * The bridge therefore hands JS only the served keys and a handle; a value crosses (and is
 * exposed) when JS reads that key. Same semantics as intempt-node's allFlags Proxy.
 */

import { nativeCalls, nativeRejections, nativeReturns } from './setup';
import { init, __resetInstanceRegistryForTests } from '../src/index';

const SERVED: Record<string, unknown> = {
  checkout_v2: true,
  banner: 'blue',
  limits: { max: 3 },
  retired: null,
};

async function sdk() {
  __resetInstanceRegistryForTests();
  const instance = await init({
    apiKey: 'prefix.secret',
    orgId: 'org-1',
    projectId: 'proj-1',
    sourceId: 'src-1',
  });
  nativeCalls.length = 0;
  return instance;
}

function serve(keys = Object.keys(SERVED)): void {
  nativeReturns.allFlags = { id: 'map-1', keys };
  nativeReturns.flagValue = (id: unknown, key: unknown) =>
    id === 'map-1' && typeof key === 'string' && key in SERVED ? { value: SERVED[key] } : {};
}

function reads(): unknown[][] {
  return nativeCalls.filter((c) => c.fn === 'flagValue').map((c) => c.args);
}

describe('allFlags', () => {
  it('lists the served keys without reading a value', async () => {
    serve();
    const flags = await (await sdk()).allFlags({ userId: 'u-1' });

    expect(Object.keys(flags)).toEqual(['checkout_v2', 'banner', 'limits', 'retired']);
    expect('banner' in flags).toBe(true);
    expect('absent' in flags).toBe(false);
    expect(reads()).toEqual([]);
  });

  it('reads one value across the bridge, once, when that key is read', async () => {
    serve();
    const flags = await (await sdk()).allFlags({ userId: 'u-1' });

    expect(flags.banner).toBe('blue');
    expect(flags.banner).toBe('blue');
    expect(reads()).toEqual([['map-1', 'banner']]);

    expect(flags.checkout_v2).toBe(true);
    expect(reads()).toEqual([
      ['map-1', 'banner'],
      ['map-1', 'checkout_v2'],
    ]);
  });

  it('keeps a served null distinct from an unserved key', async () => {
    serve();
    const flags = await (await sdk()).allFlags({});

    expect(flags.retired).toBeNull();
    expect(flags.absent).toBeUndefined();
    expect(reads()).toEqual([['map-1', 'retired']]);
  });

  it('carries object values intact', async () => {
    serve();
    const flags = await (await sdk()).allFlags({});
    expect(flags.limits).toEqual({ max: 3 });
  });

  it('reads every value for a spread, Object.entries or JSON.stringify, each once', async () => {
    serve();
    const flags = await (await sdk()).allFlags({});

    expect({ ...flags }).toEqual(SERVED);
    expect(Object.entries(flags)).toEqual(Object.entries(SERVED));
    expect(JSON.parse(JSON.stringify(flags))).toEqual(SERVED);
    expect(reads().map(([, key]) => key)).toEqual(Object.keys(SERVED));
  });

  it('never asks the bridge for a key that was not served', async () => {
    serve(['banner']);
    const flags = await (await sdk()).allFlags({});

    expect(flags.checkout_v2).toBeUndefined();
    expect(Object.prototype.toString.call(flags)).toBe('[object Object]');
    expect((flags as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
    expect(reads()).toEqual([]);
  });

  it('awaiting the result reads nothing', async () => {
    // `await` probes `then`; a Proxy that answered it would cross the bridge on every call.
    serve();
    await (await sdk()).allFlags({});
    expect(reads()).toEqual([]);
  });

  it('answers undefined when the native map is gone', async () => {
    serve();
    nativeReturns.flagValue = {};
    const flags = await (await sdk()).allFlags({});
    expect(flags.banner).toBeUndefined();
    expect(reads()).toEqual([['map-1', 'banner']]);
  });

  it('answers undefined when the native read answers null', async () => {
    serve();
    nativeReturns.flagValue = () => null;
    const flags = await (await sdk()).allFlags({});
    expect(flags.banner).toBeUndefined();
  });

  it('is a plain record the caller may change', async () => {
    serve();
    const flags = await (await sdk()).allFlags({});
    expect(delete flags.banner).toBe(true);
    expect(Object.keys(flags)).toEqual(['checkout_v2', 'limits', 'retired']);
    flags.banner = 'red';
    flags.limits = 'none';
    expect(flags.banner).toBe('red');
    expect(flags.limits).toBe('none');
    const symbol = Symbol('caller');
    (flags as Record<symbol, unknown>)[symbol] = 1;
    expect((flags as Record<symbol, unknown>)[symbol]).toBe(1);
    expect(reads()).toEqual([]);
  });

  it('answers undefined when the native read throws, rather than throwing into a render', async () => {
    serve();
    nativeRejections.flagValue = new Error('bridge gone');
    const flags = await (await sdk()).allFlags({});
    expect(flags.banner).toBeUndefined();
  });

  it.each([
    ['a failed read (empty answer)', {}],
    ['no answer', undefined],
    ['keys without a handle', { keys: ['banner'] }],
    ['a handle without keys', { id: 'map-1' }],
    ['keys that are not a list', { id: 'map-1', keys: 'banner' }],
  ])('is empty for %s', async (_label, answer) => {
    nativeReturns.allFlags = answer;
    const flags = await (await sdk()).allFlags({});
    expect(Object.keys(flags)).toEqual([]);
    expect(flags.banner).toBeUndefined();
    expect(reads()).toEqual([]);
  });

  it('passes the instance name and context to the native allFlags', async () => {
    serve();
    await (await sdk()).allFlags({ userId: 'u-1', profileId: 'p-1' });
    expect(nativeCalls).toEqual([
      { fn: 'allFlags', args: ['default', { userId: 'u-1', profileId: 'p-1' }] },
    ]);
  });
});
