/**
 * Jest setup.
 *
 * Replaces the TurboModule with a recorder. Tests assert on the arguments the
 * native module received — that is the bridge contract. They deliberately do
 * NOT assert on native behaviour, which belongs in the SDK repos where it can
 * be checked against a real queue and a real network.
 */

import type { Spec } from '../src/NativeIntempt';

export interface NativeCall {
  fn: string;
  args: unknown[];
}

/** Every call made to the native module since the last reset. */
export const nativeCalls: NativeCall[] = [];

/** Per-method return values. Set one to control what a call resolves to. */
export const nativeReturns: Record<string, unknown> = {};

/** Per-method rejections. Set one to make a call reject. */
export const nativeRejections: Record<string, unknown> = {};

const METHODS: Array<keyof Spec> = [
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
  'experiments',
  'products',
  'getAutomaticEvents',
  'setAutomaticEvents',
  'setPushToken',
  'trackPushOpen',
  'trackPushReceived',
  'getSdkVersion',
];

/** Defaults chosen so a method's natural return type is respected. */
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
  getProfileId: 'prof-test',
  getSessionId: 'ses-test',
  flush: 0,
  getFlushInterval: 60,
  experiments: [],
  products: [],
  getAutomaticEvents: { sessions: true, versionChanges: false, appStateChanges: false },
  getSdkVersion: '0.0.0-test',
};

const recorder = Object.fromEntries(
  METHODS.map((name) => [
    name,
    (...args: unknown[]) => {
      nativeCalls.push({ fn: name as string, args });
      if (name in nativeRejections) {
        return Promise.reject(nativeRejections[name as string]);
      }
      if (name in nativeReturns) {
        return Promise.resolve(nativeReturns[name as string]);
      }
      return Promise.resolve(DEFAULT_RETURNS[name as string]);
    },
  ])
);

jest.mock('../src/NativeIntempt', () => ({
  __esModule: true,
  default: recorder,
}));

/** Clears recorded calls and any configured returns or rejections. */
export function resetNative(): void {
  nativeCalls.length = 0;
  for (const key of Object.keys(nativeReturns)) {
    delete nativeReturns[key];
  }
  for (const key of Object.keys(nativeRejections)) {
    delete nativeRejections[key];
  }
}

beforeEach(resetNative);
