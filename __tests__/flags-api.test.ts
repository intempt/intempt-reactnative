/**
 * The flag and choose surface of intempt-swift 0.7.0 / intempt-android 8.0.0, bridged one to one
 * (SDK-ALIGN ruling 2026-11-27: same API and behaviour as the native SDKs, only the platform
 * differs). Every flag read goes through the native `variationDetail`, so the native SDK owns the
 * reason, the error code, the type check and the exposure.
 */

import { nativeCalls, nativeRejections, nativeReturns } from './setup';
import { init, IntemptErrorCode, __resetInstanceRegistryForTests } from '../src/index';
import type { IntemptError } from '../src/index';

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

const TARGETED = {
  value: 'blue',
  reason: 'targeted',
  variationId: 41,
  valueType: 'string',
  rule: 2,
  variant: 'b',
};

describe('variationDetail', () => {
  it('forwards key, context, the default in an envelope and disableExposure', async () => {
    const s = await sdk();
    await s.variationDetail('banner', { userId: 'u-1' }, 'red', { disableExposure: true });
    expect(nativeCalls).toEqual([
      {
        fn: 'variationDetail',
        args: ['default', 'banner', { userId: 'u-1' }, { value: 'red' }, true],
      },
    ]);
  });

  it('records the exposure unless asked not to', async () => {
    const s = await sdk();
    await s.variationDetail('banner', {}, 'red');
    expect(nativeCalls[0]!.args[4]).toBe(false);
  });

  it('answers what the native SDK answered', async () => {
    const s = await sdk();
    nativeReturns.variationDetail = TARGETED;
    await expect(s.variationDetail('banner', {}, 'red')).resolves.toEqual(TARGETED);
  });

  it('carries the error code and the transport failure', async () => {
    const s = await sdk();
    nativeReturns.variationDetail = {
      value: 'red',
      reason: 'error',
      errorCode: 'GENERAL',
      error: { kind: 'server', status: 503 },
    };
    await expect(s.variationDetail('banner', {}, 'red')).resolves.toEqual({
      value: 'red',
      reason: 'error',
      errorCode: 'GENERAL',
      error: { kind: 'server', status: 503 },
    });
  });

  it('answers the caller default itself when the native value is the default', async () => {
    // A default object crosses the bridge as a copy; the caller gets back its own reference.
    const s = await sdk();
    const fallback = { accent: '#000' };
    nativeReturns.variationDetail = {
      value: { accent: '#000' },
      reason: 'error',
      errorCode: 'TYPE_MISMATCH',
    };
    const detail = await s.variationDetail('theme', {}, fallback);
    expect(detail.value).toBe(fallback);
    expect(detail.errorCode).toBe('TYPE_MISMATCH');
  });

  it('answers the default when the native answer carries no value', async () => {
    const s = await sdk();
    nativeReturns.variationDetail = { reason: 'off' };
    await expect(s.variationDetail('banner', {}, 'red')).resolves.toEqual({
      value: 'red',
      reason: 'off',
    });
  });

  it('treats a malformed native answer as an error with the default', async () => {
    const s = await sdk();
    nativeReturns.variationDetail = null;
    await expect(s.variationDetail('banner', {}, 'red')).resolves.toEqual({
      value: 'red',
      reason: 'error',
      errorCode: 'GENERAL',
    });
  });

  it('treats a native answer without a reason as an error with the default', async () => {
    const s = await sdk();
    nativeReturns.variationDetail = { value: 'blue' };
    await expect(s.variationDetail('banner', {}, 'red')).resolves.toEqual({
      value: 'red',
      reason: 'error',
      errorCode: 'GENERAL',
    });
  });

  it('sends an empty context when none is given', async () => {
    const s = await sdk();
    await s.variationDetail('banner', undefined, 'red');
    expect(nativeCalls[0]!.args[2]).toEqual({});
  });

  it('sends a null default for an undefined one, which accepts any type (S11: no throw)', async () => {
    const s = await sdk();
    nativeReturns.variationDetail = { value: 3, reason: 'targeted' };
    await expect(s.variation('limit', {}, undefined)).resolves.toBe(3);
    expect(nativeCalls[0]!.args[3]).toEqual({ value: null });
  });
});

describe('a bad key or context returns the default, never throws (S11)', () => {
  it.each(['', 'new.checkout', 'new checkout'])(
    'leaves %j to the native SDK, which answers FLAG_NOT_FOUND',
    async (key) => {
      const s = await sdk();
      nativeReturns.variationDetail = { value: 'd', reason: 'error', errorCode: 'FLAG_NOT_FOUND' };
      await expect(s.variation(key, {}, 'd')).resolves.toBe('d');
      expect(nativeCalls[0]!.fn).toBe('variationDetail');
    }
  );

  it('answers a non-string key itself, since the bridge cannot carry it', async () => {
    const s = await sdk();
    await expect(s.variationDetail(123 as unknown as string, {}, 'd')).resolves.toEqual({
      value: 'd',
      reason: 'error',
      errorCode: 'FLAG_NOT_FOUND',
    });
    await expect(s.boolVariation(null as unknown as string, {}, true)).resolves.toBe(true);
    expect(nativeCalls).toEqual([]);
  });

  it('sends an empty context for one that is not an object, or null', async () => {
    const s = await sdk();
    await s.variation('banner', 'u-1' as unknown as object, 'red');
    await s.variation('banner', null as unknown as object, 'red');
    expect(nativeCalls.map((c) => c.args[2])).toEqual([{}, {}]);
  });
});

describe('variation and the typed reads', () => {
  const served = (value: unknown, extra: Record<string, unknown> = {}) => {
    nativeReturns.variationDetail = { value, reason: 'targeted', ...extra };
  };

  it('variation answers the value', async () => {
    const s = await sdk();
    served('blue');
    await expect(s.variation('banner', {}, 'red')).resolves.toBe('blue');
  });

  it('passes disableExposure on every read', async () => {
    const s = await sdk();
    const off = { disableExposure: true };
    await s.variation('k', {}, 'x', off);
    await s.boolVariation('k', {}, false, off);
    await s.stringVariation('k', {}, 'x', off);
    await s.numberVariation('k', {}, 0, off);
    await s.jsonVariation('k', {}, {}, off);
    expect(nativeCalls.map((c) => c.args[4])).toEqual([true, true, true, true, true]);
  });

  it('sends the typed default so the native SDK checks the type', async () => {
    const s = await sdk();
    await s.boolVariation('k', {}, true);
    await s.stringVariation('k', {}, 's');
    await s.numberVariation('k', {}, 5);
    await s.jsonVariation('k', {}, { a: 1 });
    expect(nativeCalls.map((c) => c.args[3])).toEqual([
      { value: true },
      { value: 's' },
      { value: 5 },
      { value: { a: 1 } },
    ]);
  });

  it('jsonVariation answers a served object, and its own default otherwise', async () => {
    const s = await sdk();
    served({ max: 3 });
    await expect(s.jsonVariation('limits', {}, {})).resolves.toEqual({ max: 3 });
    const fallback = { max: 1 };
    served({ max: 1 }, { reason: 'error', errorCode: 'TYPE_MISMATCH' });
    await expect(s.jsonVariation('limits', {}, fallback)).resolves.toBe(fallback);
  });

  it('a read the native SDK could not answer is still a rejection the caller can locate', async () => {
    const s = await sdk();
    nativeRejections.variationDetail = { code: 'not_initialized', message: 'no instance' };
    const error = (await s.jsonVariation('k', {}, {}).catch((e: unknown) => e)) as IntemptError;
    expect(error.method).toBe('variationDetail');
    expect(error.code).toBe(IntemptErrorCode.NotInitialized);
  });
});

describe('choose', () => {
  it('forwards context and options', async () => {
    const s = await sdk();
    await s.choose({ userId: 'u-1' }, { names: ['hero'], groups: ['home'], disableExposure: true });
    expect(nativeCalls).toEqual([
      {
        fn: 'choose',
        args: [
          'default',
          { userId: 'u-1' },
          { names: ['hero'], groups: ['home'], disableExposure: true },
        ],
      },
    ]);
  });

  it('sends empty context and no filters by default', async () => {
    const s = await sdk();
    await s.choose();
    expect(nativeCalls[0]!.args).toEqual(['default', {}, { disableExposure: false }]);
  });

  it('answers the served choices', async () => {
    const s = await sdk();
    const choices = [
      { name: 'hero', group: 'home', body: { title: 'Hi' }, experienceId: 7, variantId: 9, reason: 'targeted' },
      { name: 'bare', body: null },
    ];
    nativeReturns.choose = choices;
    await expect(s.choose({})).resolves.toEqual(choices);
  });

  it('answers an empty list for a malformed native answer', async () => {
    const s = await sdk();
    nativeReturns.choose = { not: 'a list' };
    await expect(s.choose({})).resolves.toEqual([]);
  });
});
