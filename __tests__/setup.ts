/**
 * Jest setup.
 *
 * Replaces the TurboModule with a recorder. Tests assert on the arguments the
 * native module received — that is the bridge contract. They deliberately do
 * NOT assert on native behaviour, which belongs in the SDK repos where it can
 * be checked against a real queue and a real network.
 *
 * Note the `mock`-prefixed names. `jest.mock()` is hoisted above every other
 * statement in the file, so its factory may not close over ordinary
 * module-scope variables — they would still be uninitialised when the factory
 * runs. Jest allows the reference only for identifiers beginning with `mock`,
 * which is an explicit acknowledgement that the variable is read lazily.
 */

export interface NativeCall {
  fn: string;
  args: unknown[];
}

/** Every call made to the native module since the last reset. */
const mockNativeCalls: NativeCall[] = [];

/** Per-method return values. Set one to control what a call resolves to. */
const mockNativeReturns: Record<string, unknown> = {};

/** Per-method rejections. Set one to make a call reject. */
const mockNativeRejections: Record<string, unknown> = {};

jest.mock('../src/NativeIntempt', () => {
  // Declared inside the factory for the same hoisting reason.
  const METHODS = [
    'initialize',
    'track',
    'identify',
    'group',
    'alias',
    'record',
    'productAdd',
    'productView',
    'productOrdered',
    'consent',
    'getProfileId',
    'getSessionId',
    'logOut',
    'reset',
    'optIn',
    'optOut',
    'hasOptedOut',
    'flush',
    'getFlushInterval',
    'setFlushInterval',
    'products',
    'getAutomaticEvents',
    'setAutomaticEvents',
    'configureAutocapture',
    'startAutocapture',
    'stopAutocapture',
    'isAutocaptureRunning',
    'setPushToken',
    'trackPushOpen',
    'trackPushReceived',
    'getSdkVersion',
  ];

  /** Chosen so each method's natural return type is respected. */
  const DEFAULT_RETURNS: Record<string, unknown> = {
    track: true,
    identify: true,
    group: true,
    alias: true,
    record: true,
    productAdd: true,
    productView: true,
    productOrdered: true,
    consent: true,
    hasOptedOut: false,
    setPushToken: true,
    trackPushOpen: true,
    trackPushReceived: true,
    isAutocaptureRunning: false,
    getProfileId: 'prof-test',
    getSessionId: 'ses-test',
    flush: 0,
    getFlushInterval: 60,
    products: [],
    getAutomaticEvents: {
      sessions: true,
      versionChanges: false,
      appStateChanges: false,
    },
    getSdkVersion: '0.0.0-test',
  };

  return {
    __esModule: true,
    default: Object.fromEntries(
      METHODS.map((name) => [
        name,
        (...args: unknown[]) => {
          mockNativeCalls.push({ fn: name, args });
          if (name in mockNativeRejections) {
            return Promise.reject(mockNativeRejections[name]);
          }
          if (name in mockNativeReturns) {
            return Promise.resolve(mockNativeReturns[name]);
          }
          return Promise.resolve(DEFAULT_RETURNS[name]);
        },
      ])
    ),
  };
});

export const nativeCalls = mockNativeCalls;
export const nativeReturns = mockNativeReturns;
export const nativeRejections = mockNativeRejections;

/** Clears recorded calls and any configured returns or rejections. */
export function resetNative(): void {
  mockNativeCalls.length = 0;
  for (const key of Object.keys(mockNativeReturns)) {
    delete mockNativeReturns[key];
  }
  for (const key of Object.keys(mockNativeRejections)) {
    delete mockNativeRejections[key];
  }
}

beforeEach(resetNative);
