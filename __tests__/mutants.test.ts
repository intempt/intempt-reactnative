/**
 * Tests written to kill specific surviving mutants.
 *
 * Stryker scored 77.67% on the first run. Coverage was already 99% of
 * statements, which is exactly the gap this file exists to close: every line
 * below was executed by the existing suite and none of them was asserted on.
 * Each test here names the mutant it kills, so a future reader can tell the
 * difference between a test that guards behaviour and one that pads a number.
 */

import { nativeCalls, nativeRejections, nativeReturns, resetNative } from './setup';
import {
  ConsentAction,
  IntemptError,
  IntemptErrorCode,
  init,
  __resetInstanceRegistryForTests,
} from '../src/index';
import { fromNativeRejection } from '../src/errors';
import IntemptDefault from '../src/index';

/**
 * Awaits a rejection and returns it typed, failing loudly if the call resolves.
 *
 * `.catch(e => e as IntemptError)` types as `T | IntemptError`, and would
 * silently compare assertions against a resolved value if the call ever
 * stopped rejecting.
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

async function sdk() {
  __resetInstanceRegistryForTests();
  const instance = await init(VALID);
  resetNative();
  return instance;
}

beforeEach(() => {
  __resetInstanceRegistryForTests();
  resetNative();
});

describe('IntemptError.isRetryable — errors.ts:88-90', () => {
  // Killed: ConditionalExpression at errors.ts:90 replaced with `false`. The
  // existing suite only exercised Retryable, so removing the Transport arm
  // changed nothing.
  it.each([
    [IntemptErrorCode.Retryable, true],
    [IntemptErrorCode.Transport, true],
    [IntemptErrorCode.Terminal, false],
    [IntemptErrorCode.Server, false],
    [IntemptErrorCode.StorageUnavailable, false],
    [IntemptErrorCode.Unknown, false],
  ])('%s -> isRetryable %s', (code, expected) => {
    expect(new IntemptError(code, 'x').isRetryable).toBe(expected);
  });

  it('treats a transport failure as retryable but a server rejection as not', () => {
    // The distinction is contractual: a network failure may succeed on retry,
    // a rejected payload will not.
    expect(new IntemptError(IntemptErrorCode.Transport, 'socket closed').isRetryable).toBe(true);
    expect(new IntemptError(IntemptErrorCode.Server, 'bad payload').isRetryable).toBe(false);
  });
});

describe('IntemptError.isUnsupported — errors.ts:96-98', () => {
  // Killed: ConditionalExpression at errors.ts:97 replaced with `true`. Only
  // the Android arm was ever tested, so the iOS arm and the negative case were
  // both unasserted.
  it.each([
    [IntemptErrorCode.UnsupportedOnAndroid, true],
    [IntemptErrorCode.UnsupportedOnIos, true],
    [IntemptErrorCode.NotInitialized, false],
    [IntemptErrorCode.Terminal, false],
    [IntemptErrorCode.Unknown, false],
  ])('%s -> isUnsupported %s', (code, expected) => {
    expect(new IntemptError(code, 'x').isUnsupported).toBe(expected);
  });

  it('an unsupported method is never also retryable', () => {
    // Retrying a method the platform does not have loops forever.
    const error = new IntemptError(IntemptErrorCode.UnsupportedOnIos, 'x');
    expect(error.isUnsupported).toBe(true);
    expect(error.isRetryable).toBe(false);
  });
});

describe('fromNativeRejection — errors.ts:111', () => {
  // Killed: ConditionalExpression at errors.ts:111 replaced with `if (false)`.
  // Nothing passed an existing IntemptError back in, so the early return was
  // never observed.
  it('returns an existing IntemptError unchanged rather than re-wrapping it', () => {
    const original = new IntemptError(IntemptErrorCode.Terminal, 'original', {
      status: 401,
      method: 'track',
    });
    const result = fromNativeRejection(original, 'somethingElse');

    expect(result).toBe(original);
    // Re-wrapping would overwrite `method` with the outer call's name and lose
    // the status, turning a precise error into a vague one.
    expect(result.method).toBe('track');
    expect(result.status).toBe(401);
  });

  it('preserves retryAfter from userInfo', () => {
    const result = fromNativeRejection(
      { code: 'retryable', message: 'slow down', userInfo: { status: 429, retryAfter: 12 } },
      'flush'
    );
    expect(result.retryAfter).toBe(12);
    expect(result.status).toBe(429);
  });

  it('leaves status and retryAfter undefined when userInfo is absent', () => {
    const result = fromNativeRejection({ code: 'encoding_failed', message: 'x' }, 'track');
    expect(result.status).toBeUndefined();
    expect(result.retryAfter).toBeUndefined();
  });

  it('names the method in the fallback message when native sends none', () => {
    expect(fromNativeRejection({}, 'productAdd').message).toBe('Intempt.productAdd failed');
  });
});

describe('encodeValue — index.ts:63-69', () => {
  // Killed: ConditionalExpression at index.ts:66. The object branch was
  // exercised but its guard was not: replacing `value !== null && typeof
  // value === 'object'` with `true` still passed, because no test sent a
  // primitive through a path where the difference showed.
  it('passes primitives through untouched', async () => {
    const s = await sdk();
    await s.track('e', { str: 'x', num: 7, bool: true, neg: -1, zero: 0, empty: '' });
    expect(nativeCalls[0]!.args[2]).toEqual({
      str: 'x', num: 7, bool: true, neg: -1, zero: 0, empty: '',
    });
  });

  it('distinguishes null from a nested object', async () => {
    const s = await sdk();
    await s.track('e', { nulled: null, obj: { inner: 1 } });
    expect(nativeCalls[0]!.args[2]).toEqual({ nulled: null, obj: { inner: 1 } });
  });

  it('recurses through arrays of objects', async () => {
    const s = await sdk();
    await s.track('e', { rows: [{ a: 1 }, { b: new Date('2020-01-01T00:00:00.000Z') }] });
    expect(nativeCalls[0]!.args[2]).toEqual({
      rows: [{ a: 1 }, { b: '2020-01-01T00:00:00.000Z' }],
    });
  });
});

describe('encodeProperties — index.ts:76', () => {
  // Killed: ConditionalExpression at index.ts:76. `null` and `undefined` both
  // had to map to null, and only one of the two was covered.
  it('maps an explicitly null property map to null', async () => {
    const s = await sdk();
    await s.identify('u', { userAttributes: undefined, data: undefined });
    expect(nativeCalls[0]!.args[3]).toBeNull();
    expect(nativeCalls[0]!.args[4]).toBeNull();
  });

  it('sends an empty object as an empty object, not as null', async () => {
    // A caller passing {} means "no attributes"; a caller passing nothing means
    // "do not mention attributes". Collapsing them loses that.
    const s = await sdk();
    await s.track('e', {});
    expect(nativeCalls[0]!.args[2]).toEqual({});
    expect(nativeCalls[0]!.args[2]).not.toBeNull();
  });
});

describe('requireNonBlank — index.ts:93', () => {
  // Killed: the type check and the trim check are separate arms; only blank
  // strings were tested, never a non-string.
  it.each([
    ['tab only', '\t'],
    ['newline only', '\n'],
    ['mixed whitespace', ' \t\n '],
  ])('rejects %s', async (_label, value) => {
    await expect(init({ ...VALID, apiKey: value })).rejects.toMatchObject({
      code: IntemptErrorCode.MissingConfiguration,
    });
  });

  it('rejects a non-string identifier', async () => {
    await expect(
      init({ ...VALID, orgId: 42 as unknown as string })
    ).rejects.toMatchObject({ code: IntemptErrorCode.MissingConfiguration });
  });

  // Kills the StringLiteral mutants on each field name passed to
  // requireNonBlank. The message is the only thing telling an integrator WHICH
  // of the four identifiers is wrong; blanking the name leaves them with
  // " must be a non-empty string" and four candidates.
  it.each(['apiKey', 'orgId', 'projectId', 'sourceId'])(
    'names %s in the message when it is the blank one',
    async (field) => {
      await expect(init({ ...VALID, [field]: '' })).rejects.toThrow(
        `${field} must be a non-empty string`
      );
    }
  );
});

describe('argument defaults — index.ts:386-512', () => {
  // Killed: the `?? null` / `?? 10` / `?? 'Identify'` defaults. Each was
  // executed but never asserted in its defaulted form.
  it('defaults every optional record() field to null', async () => {
    const s = await sdk();
    await s.record('e');
    expect(nativeCalls[0]!.args).toEqual(['default', 'e', null, null, null, null, null]);
  });

  it('defaults consent optionals to null', async () => {
    const s = await sdk();
    await s.consent(ConsentAction.Accept, 100);
    expect(nativeCalls[0]!.args).toEqual(['default', 'accept', 100, null, null, null]);
  });

  // Regression: this asserted a default of 'Identify'. "identify" is in
  // CustomCaptureService.forbiddenEventNames on intempt-android and the match
  // is case-insensitive, so that default made every default identify() and
  // group() fail validation and queue nothing — resolving false while the
  // caller had no reason to look. Each SDK names the event itself when unset.
  it('leaves identify and group event titles unset so each SDK names its own', async () => {
    const s = await sdk();
    await s.identify('u');
    await s.group('a');
    expect(nativeCalls[0]!.args[2]).toBeNull();
    expect(nativeCalls[1]!.args[2]).toBeNull();
  });

  it('honours an explicit event title over the default', async () => {
    const s = await sdk();
    await s.identify('u', { eventTitle: 'Signed in' });
    expect(nativeCalls[0]!.args[2]).toBe('Signed in');
  });

  it('defaults products() productId to null and count to 10', async () => {
    const s = await sdk();
    await s.products({ feedId: 'f' });
    expect(nativeCalls[0]!.args[2]).toBe(10);
    expect(nativeCalls[0]!.args[4]).toBeNull();
  });

  it('forwards an explicit productId', async () => {
    const s = await sdk();
    await s.products({ feedId: 'f', productId: 'sku-1' });
    expect(nativeCalls[0]!.args[4]).toBe('sku-1');
  });
});

describe('autocapture object', () => {
  it('forwards configure, start, stop and isRunning to the right natives', async () => {
    const s = await sdk();
    await s.autocapture.configure({ screenViews: true, controlInteractions: false });
    await s.autocapture.start();
    await s.autocapture.stop();
    nativeReturns.isAutocaptureRunning = true;
    await expect(s.autocapture.isRunning()).resolves.toBe(true);

    expect(nativeCalls.map((c) => c.fn)).toEqual([
      'configureAutocapture',
      'startAutocapture',
      'stopAutocapture',
      'isAutocaptureRunning',
    ]);
  });

  it('wraps an autocapture rejection as an IntemptError with the right method', async () => {
    const s = await sdk();
    nativeRejections.startAutocapture = {
      code: 'unsupported_on_android',
      message: 'not yet',
    };
    const error = await rejection(s.autocapture.start());
    expect(error).toBeInstanceOf(IntemptError);
    expect(error.method).toBe('startAutocapture');
    expect(error.isUnsupported).toBe(true);
  });
});

describe('instance registry', () => {
  it('addresses every call with the instance name it was created under', async () => {
    __resetInstanceRegistryForTests();
    const eu = await init({ ...VALID, instanceName: 'eu' });
    resetNative();

    await eu.track('e');
    await eu.flush();
    await eu.getProfileId();

    expect(nativeCalls.every((c) => c.args[0] === 'eu')).toBe(true);
  });
});

describe('every method labels its own errors', () => {
  /**
   * Kills ~25 surviving StringLiteral mutants in one table, and the reason they
   * survived is worth stating: each is the label passed to `this.call(...)`,
   * which becomes `error.method`. Blanking any of them changed no assertion,
   * because nothing checked which call had failed — the one field an
   * integrator uses to locate a failure in their own code.
   *
   * Driven off the native method name so a new bridged method with a
   * copy-pasted label is caught here rather than shipped.
   */
  const CASES: Array<[label: string, invoke: (s: Awaited<ReturnType<typeof sdk>>) => Promise<unknown>]> = [
    ['track', (s) => s.track('e')],
    ['identify', (s) => s.identify('u')],
    ['group', (s) => s.group('a')],
    ['alias', (s) => s.alias('u', 'v')],
    ['record', (s) => s.record('e')],
    ['productAdd', (s) => s.productAdd('p', 1)],
    ['productView', (s) => s.productView('p')],
    ['productOrdered', (s) => s.productOrdered([{ productId: 'p', quantity: 1 }])],
    ['consent', (s) => s.consent(ConsentAction.Accept, 1)],
    ['getProfileId', (s) => s.getProfileId()],
    ['getSessionId', (s) => s.getSessionId()],
    ['logOut', (s) => s.logOut()],
    ['reset', (s) => s.reset()],
    ['optIn', (s) => s.optIn()],
    ['optOut', (s) => s.optOut()],
    ['hasOptedOut', (s) => s.hasOptedOut()],
    ['flush', (s) => s.flush()],
    ['getFlushInterval', (s) => s.getFlushInterval()],
    ['setFlushInterval', (s) => s.setFlushInterval(1)],
    ['products', (s) => s.products({ feedId: 'f' })],
    ['getAutomaticEvents', (s) => s.getAutomaticEvents()],
    ['setAutomaticEvents', (s) => s.setAutomaticEvents({ sessions: true, versionChanges: false, appStateChanges: false })],
    ['setPushToken', (s) => s.setPushToken('t')],
    ['trackPushOpen', (s) => s.trackPushOpen({})],
    ['trackPushReceived', (s) => s.trackPushReceived({})],
    ['configureAutocapture', (s) => s.autocapture.configure({ screenViews: true, controlInteractions: true })],
    ['startAutocapture', (s) => s.autocapture.start()],
    ['stopAutocapture', (s) => s.autocapture.stop()],
    ['isAutocaptureRunning', (s) => s.autocapture.isRunning()],
  ];

  it.each(CASES)('%s reports itself as the failing method', async (label, invoke) => {
    const s = await sdk();
    nativeRejections[label] = { code: 'transport', message: 'network down' };
    const error = await rejection(invoke(s));
    expect(error.method).toBe(label);
    expect(error.code).toBe(IntemptErrorCode.Transport);
  });

  it('covers every bridged method', () => {
    // Guards the table itself. A method added to the bridge without an entry
    // here would otherwise leave its label unasserted, which is how the
    // original 25 got in.
    const corpus = require('./fixtures/contract-methods.json');
    const bridged = Object.keys(corpus.methods);
    const labelled = CASES.map(([l]) => l);
    // initialize is exercised separately — it is not an instance method.
    expect(bridged.filter((m) => m !== 'initialize' && !labelled.includes(m))).toEqual([]);
  });
});

describe('error identity and module shape', () => {
  it('names the error class', async () => {
    // Killed: StringLiteral `this.name = 'IntemptError'`. Anything logging
    // error.name would have printed the mutated value.
    const s = await sdk();
    nativeRejections.track = { code: 'terminal', message: 'x' };
    expect((await rejection(s.track('e'))).name).toBe('IntemptError');
  });

  it('labels a failed init as init', async () => {
    // Killed: StringLiteral in `fromNativeRejection(error, 'init')`.
    nativeRejections.initialize = { code: 'malformed_api_key', message: 'bad' };
    __resetInstanceRegistryForTests();
    expect((await rejection(init(VALID))).method).toBe('init');
  });

  it('attaches the init method to a blank-identifier rejection', async () => {
    // Killed: ObjectLiteral `{ method: 'init' }` -> `{}` in requireNonBlank.
    expect((await rejection(init({ ...VALID, orgId: '' }))).method).toBe('init');
  });

  it('exports the module surface on the default export', () => {
    // Killed: ObjectLiteral `export default { ... }` -> `{}`.
    const mod = IntemptDefault;
    expect(Object.keys(mod).sort()).toEqual(
      ['getSdkVersion', 'init', 'instance', 'mainInstance'].sort()
    );
    expect(typeof mod.init).toBe('function');
  });

  it('treats an explicitly null property map as absent', async () => {
    // Killed: ConditionalExpression at index.ts:76, the `=== null` arm.
    // TypeScript forbids this, JavaScript callers do it anyway, and without the
    // null arm Object.entries(null) throws.
    const s = await sdk();
    await s.track('e', null as unknown as undefined);
    expect(nativeCalls[0]!.args[2]).toBeNull();
  });
});
