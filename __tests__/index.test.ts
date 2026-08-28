/**
 * Behaviour the corpus does not cover: initialisation, the instance registry,
 * type encoding edge cases, and error mapping.
 */

import { nativeCalls, nativeRejections, nativeReturns, resetNative } from './setup';
import {
  ConsentAction,
  DEFAULT_FEED_FIELDS,
  IntemptError,
  IntemptErrorCode,
  init,
  instance,
  mainInstance,
  getSdkVersion,
  __resetInstanceRegistryForTests,
} from '../src/index';


/**
 * Awaits a rejection and returns it typed.
 *
 * Deliberately fails when the promise resolves. The `.catch(e => e)` form types
 * as `T | IntemptError` and, if the call ever stopped rejecting, would compare
 * assertions against the resolved value rather than reporting that the
 * rejection vanished — a test that silently stops testing what it names.
 */
async function rejection(promise: Promise<unknown>): Promise<IntemptError> {
  try {
    await promise;
  } catch (error) {
    return error as IntemptError;
  }
  throw new Error('expected the call to reject, but it resolved');
}

const VALID = {
  apiKey: 'prefix.secret',
  orgId: 'org-1',
  projectId: 'proj-1',
  sourceId: 'src-1',
};

beforeEach(() => {
  __resetInstanceRegistryForTests();
  resetNative();
});

describe('init', () => {
  it('passes credentials to native and defaults the instance name', async () => {
    await init(VALID);
    expect(nativeCalls[0]).toEqual({
      fn: 'initialize',
      args: ['default', 'prefix.secret', 'org-1', 'proj-1', 'src-1', true],
    });
  });

  // The platform derives country/region/city from the address the request already arrives on.
  // The device never reads or sends its own address; it states whether the derivation is wanted.
  it('defaults geolocation on, matching the native SDKs', async () => {
    await init(VALID);
    expect(nativeCalls[0].args[5]).toBe(true);
  });

  it('passes the geolocation opt-out through to native', async () => {
    await init({ ...VALID, useIpAddressForGeolocation: false });
    expect(nativeCalls[0].args[5]).toBe(false);
  });

  it.each([
    ['apiKey', { ...VALID, apiKey: '' }],
    ['orgId', { ...VALID, orgId: '   ' }],
    ['projectId', { ...VALID, projectId: '' }],
    ['sourceId', { ...VALID, sourceId: ' ' }],
  ])('rejects a blank %s before touching native', async (_field, config) => {
    await expect(init(config)).rejects.toThrow(IntemptError);
    await expect(init(config)).rejects.toMatchObject({
      code: IntemptErrorCode.MissingConfiguration,
    });
    // The point of validating here is to not hand native a blank identifier.
    expect(nativeCalls).toHaveLength(0);
  });

  it('returns the same instance for a repeated name without re-initialising', async () => {
    const first = await init(VALID);
    resetNative();
    const second = await init(VALID);

    expect(second).toBe(first);
    expect(nativeCalls).toHaveLength(0);
  });

  it('keeps named instances separate', async () => {
    const a = await init(VALID);
    const b = await init({ ...VALID, instanceName: 'secondary' });

    expect(b).not.toBe(a);
    expect(a.name).toBe('default');
    expect(b.name).toBe('secondary');
    expect(mainInstance()).toBe(a);
    expect(instance('secondary')).toBe(b);
    expect(instance('absent')).toBeUndefined();
  });

  it('does not register the instance when native initialisation fails', async () => {
    nativeRejections.initialize = { code: 'malformed_api_key', message: 'bad key' };

    await expect(init(VALID)).rejects.toMatchObject({
      code: IntemptErrorCode.MalformedApiKey,
    });
    // A registered instance after a failed init would let every later call
    // resolve against an instance native does not have.
    expect(mainInstance()).toBeUndefined();
  });
});

describe('value encoding', () => {
  it('preserves numbers and booleans rather than stringifying them', async () => {
    const sdk = await init(VALID);
    resetNative();

    await sdk.track('e', { count: 3, ratio: 0.5, active: true, name: 'x' });

    expect(nativeCalls[0]!.args[2]).toEqual({
      count: 3,
      ratio: 0.5,
      active: true,
      name: 'x',
    });
  });

  it('converts nested and arrayed Dates to ISO 8601', async () => {
    const sdk = await init(VALID);
    resetNative();

    await sdk.track('e', {
      at: new Date('2026-08-15T10:30:00.000Z'),
      nested: { seen: new Date('2020-01-01T00:00:00.000Z') },
      list: [new Date('2021-06-01T12:00:00.000Z')],
    });

    expect(nativeCalls[0]!.args[2]).toEqual({
      at: '2026-08-15T10:30:00.000Z',
      nested: { seen: '2020-01-01T00:00:00.000Z' },
      list: ['2021-06-01T12:00:00.000Z'],
    });
  });

  it('forwards explicit null but drops undefined', async () => {
    const sdk = await init(VALID);
    resetNative();

    await sdk.track('e', {
      cleared: null,
      absent: undefined as never,
      kept: 1,
    });

    const data = nativeCalls[0]!.args[2] as Record<string, unknown>;
    expect(data).toEqual({ cleared: null, kept: 1 });
    expect('absent' in data).toBe(false);
  });

  it('sends null rather than an empty object for omitted properties', async () => {
    const sdk = await init(VALID);
    resetNative();

    await sdk.track('e');

    expect(nativeCalls[0]!.args[2]).toBeNull();
  });
});

describe('defaults', () => {
  it('defaults products() fields to the compact set, not to all columns', async () => {
    const sdk = await init(VALID);
    resetNative();

    await sdk.products({ feedId: 'feed-1' });

    expect(nativeCalls[0]!.args[3]).toEqual([...DEFAULT_FEED_FIELDS]);
    expect(nativeCalls[0]!.args[2]).toBe(10);
  });

  it('honours an explicitly widened field list', async () => {
    const sdk = await init(VALID);
    resetNative();

    await sdk.products({ feedId: 'feed-1', fields: ['productId', 'stock'], count: 3 });

    expect(nativeCalls[0]!.args[2]).toBe(3);
    expect(nativeCalls[0]!.args[3]).toEqual(['productId', 'stock']);
  });
});

describe('isOptedIn', () => {
  it('inverts hasOptedOut', async () => {
    const sdk = await init(VALID);

    nativeReturns.hasOptedOut = true;
    expect(await sdk.isOptedIn()).toBe(false);

    nativeReturns.hasOptedOut = false;
    expect(await sdk.isOptedIn()).toBe(true);
  });
});

describe('consent', () => {
  it('sends the enum value, not an arbitrary string', async () => {
    const sdk = await init(VALID);
    resetNative();

    await sdk.consent(ConsentAction.Reject, 1798761600);

    expect(nativeCalls[0]!.args[1]).toBe('reject');
  });
});

describe('error mapping', () => {
  it('maps a known native code and preserves status and retryAfter', async () => {
    const sdk = await init(VALID);
    nativeRejections.track = {
      code: 'retryable',
      message: 'server asked for backoff',
      userInfo: { status: 503, retryAfter: 30 },
    };

    const error = await rejection(sdk.track('e'));

    expect(error).toBeInstanceOf(IntemptError);
    expect(error.code).toBe(IntemptErrorCode.Retryable);
    expect(error.status).toBe(503);
    expect(error.retryAfter).toBe(30);
    expect(error.method).toBe('track');
    expect(error.isRetryable).toBe(true);
  });

  it('treats an unrecognised code as unknown without discarding the message', async () => {
    const sdk = await init(VALID);
    nativeRejections.track = { code: 'something_new', message: 'from a newer native SDK' };

    const error = await rejection(sdk.track('e'));

    expect(error.code).toBe(IntemptErrorCode.Unknown);
    // Remapping an unknown code onto a known one would misreport the failure.
    expect(error.message).toBe('from a newer native SDK');
  });

  it('classifies 401 as terminal rather than retryable', async () => {
    const sdk = await init(VALID);
    nativeRejections.track = {
      code: 'terminal',
      message: 'unauthorized',
      userInfo: { status: 401 },
    };

    const error = await rejection(sdk.track('e'));

    expect(error.code).toBe(IntemptErrorCode.Terminal);
    expect(error.isRetryable).toBe(false);
  });

  it('flags a platform gap as unsupported rather than as a failure', async () => {
    const sdk = await init(VALID);
    nativeRejections.flush = {
      code: 'unsupported_on_android',
      message: 'flush is not available on intempt-android below 3.0',
    };

    const error = await rejection(sdk.flush());

    expect(error.isUnsupported).toBe(true);
    expect(error.isRetryable).toBe(false);
  });

  it('survives instanceof across transpilation', async () => {
    const sdk = await init(VALID);
    nativeRejections.track = { code: 'encoding_failed', message: 'nope' };

    const error = await rejection(sdk.track('e'));

    expect(error instanceof IntemptError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });

  it('wraps a non-object rejection instead of throwing while handling it', async () => {
    const sdk = await init(VALID);
    nativeRejections.track = null;

    const error = await rejection(sdk.track('e'));

    expect(error).toBeInstanceOf(IntemptError);
    expect(error.code).toBe(IntemptErrorCode.Unknown);
    expect(error.message).toBe('Intempt.track failed');
  });
});

describe('getSdkVersion', () => {
  it('reports the native SDK version', async () => {
    nativeReturns.getSdkVersion = '3.0.0';
    expect(await getSdkVersion()).toBe('3.0.0');
  });
});
