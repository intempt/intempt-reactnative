/**
 * allFlags exposure (PLAN-ROWS F32; SDK-ALIGN PLAN §7 item 5, option A).
 *
 * intempt-swift / intempt-android record a flag's exposure when a value is read from the map
 * allFlags returns. The bridge copies the values across with the native `snapshot()` (no exposure)
 * and, on the first JS read of a key, asks the native map to `expose` that key. Same semantics as
 * intempt-node's allFlags Proxy.
 */

import { nativeCalls, nativeRejections, nativeReturns } from './setup';
import { init, __resetInstanceRegistryForTests } from '../src/index';

const SERVED: Record<string, unknown> = {
  checkout_v2: true,
  banner: 'blue',
  limits: { max: 3 },
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

function serve(values: Record<string, unknown> = SERVED, token: unknown = 'map-1'): void {
  nativeReturns.allFlags = { token, values };
}

function exposed(): unknown[][] {
  return nativeCalls.filter((c) => c.fn === 'exposeFlag').map((c) => c.args);
}

describe('allFlags', () => {
  it('answers every served value and exposes nothing until a key is read', async () => {
    serve();
    const flags = await (await sdk()).allFlags({ userId: 'u-1' });

    expect(Object.keys(flags)).toEqual(['checkout_v2', 'banner', 'limits']);
    expect('banner' in flags).toBe(true);
    expect('absent' in flags).toBe(false);
    expect(exposed()).toEqual([]);
  });

  it('exposes a key once, on its first read, through that map', async () => {
    serve();
    const flags = await (await sdk()).allFlags({});

    expect(flags.banner).toBe('blue');
    expect(flags.banner).toBe('blue');
    expect(exposed()).toEqual([['map-1', 'banner']]);
    expect(flags.checkout_v2).toBe(true);
    expect(exposed()).toEqual([
      ['map-1', 'banner'],
      ['map-1', 'checkout_v2'],
    ]);
  });

  it('carries object values intact', async () => {
    serve();
    const flags = await (await sdk()).allFlags({});
    expect(flags.limits).toEqual({ max: 3 });
  });

  it('exposes every key for a spread, Object.entries or JSON.stringify, each once', async () => {
    serve();
    const flags = await (await sdk()).allFlags({});

    expect({ ...flags }).toEqual(SERVED);
    expect(Object.entries(flags)).toEqual(Object.entries(SERVED));
    expect(JSON.parse(JSON.stringify(flags))).toEqual(SERVED);
    expect(exposed().map(([, key]) => key)).toEqual(Object.keys(SERVED));
  });

  it('never exposes a key that was not served, a symbol or an inherited member', async () => {
    serve({ banner: 'blue' });
    const flags = await (await sdk()).allFlags({});

    expect(flags.checkout_v2).toBeUndefined();
    expect(Object.prototype.toString.call(flags)).toBe('[object Object]');
    expect((flags as Record<symbol, unknown>)[Symbol.iterator]).toBeUndefined();
    expect(exposed()).toEqual([]);
  });

  it('awaiting the result exposes nothing', async () => {
    // `await` probes `then`; a Proxy that answered it would expose on every call.
    serve();
    await (await sdk()).allFlags({});
    expect(exposed()).toEqual([]);
  });

  it('is a plain record the caller may change, without exposing what it wrote', async () => {
    serve();
    const flags = await (await sdk()).allFlags({});
    expect(delete flags.banner).toBe(true);
    expect(Object.keys(flags)).toEqual(['checkout_v2', 'limits']);
    flags.banner = 'red';
    flags.limits = 'none';
    expect(flags.banner).toBe('red');
    expect(flags.limits).toBe('none');
    expect(exposed()).toEqual([]);
  });

  it('still answers the value when the native expose fails', async () => {
    serve();
    nativeRejections.exposeFlag = { code: 'unknown', message: 'gone' };
    const flags = await (await sdk()).allFlags({});
    expect(flags.banner).toBe('blue');
    await Promise.resolve();
    expect(exposed()).toEqual([['map-1', 'banner']]);
  });

  it('answers values without exposing when the native map had nothing to expose', async () => {
    // No token: the native side kept no map, so there is nothing to expose through.
    serve({ banner: 'blue' }, undefined);
    const flags = await (await sdk()).allFlags({});
    expect(flags.banner).toBe('blue');
    expect(exposed()).toEqual([]);
  });

  it.each([
    ['a failed read (empty answer)', {}],
    ['no answer', undefined],
    ['values that are not an object', { token: 'map-1', values: 'banner' }],
    ['values that are null', { token: 'map-1', values: null }],
  ])('is empty for %s', async (_label, answer) => {
    nativeReturns.allFlags = answer;
    const flags = await (await sdk()).allFlags({});
    expect(Object.keys(flags)).toEqual([]);
    expect(flags.banner).toBeUndefined();
    expect(exposed()).toEqual([]);
  });

  it('passes the instance name and context to the native allFlags', async () => {
    serve();
    await (await sdk()).allFlags({ userId: 'u-1', profileId: 'p-1' });
    expect(nativeCalls).toEqual([
      { fn: 'allFlags', args: ['default', { userId: 'u-1', profileId: 'p-1' }] },
    ]);
  });
});
