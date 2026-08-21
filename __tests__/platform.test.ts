/**
 * Platform-absence behaviour.
 *
 * On a platform with no native module (react-native-web, react-native-windows,
 * react-native-macos) the TurboModule lookup returns null. The SDK used
 * `getEnforcing`, which throws at IMPORT time — an uncatchable red-screen the
 * moment any file imports the SDK, before init() ever runs. The contract is
 * the same as a method-level platform gap: a catchable `IntemptError` whose
 * `isUnsupported` is true, raised from the call, never from the import.
 *
 * These tests bypass the recorder mock in setup.ts: they re-mock the native
 * module as `null` and re-import the SDK in an isolated registry.
 */

import { IntemptError, IntemptErrorCode } from '../src/errors';

function importSdkWithNullNativeModule(): typeof import('../src/index') {
  let sdk: typeof import('../src/index') | undefined;
  jest.isolateModules(() => {
    jest.doMock('../src/NativeIntempt', () => ({ __esModule: true, default: null }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sdk = require('../src/index') as typeof import('../src/index');
  });
  if (!sdk) throw new Error('SDK failed to import');
  return sdk;
}

const CONFIG = {
  apiKey: 'prefix.secret',
  orgId: 'org',
  projectId: 'project',
  sourceId: 'source',
};

describe('a platform with no native module', () => {
  it('importing the SDK does not throw', () => {
    expect(() => importSdkWithNullNativeModule()).not.toThrow();
  });

  it('init() rejects with a catchable UnsupportedPlatform error', async () => {
    const sdk = importSdkWithNullNativeModule();
    const failure = sdk.init(CONFIG).then(
      () => {
        throw new Error('init() must not resolve without a native module');
      },
      (error: unknown) => error
    );
    const error = await failure;
    // instanceof against the isolated registry's own class — the outer import
    // is a different module instance, so identity would not match.
    expect(error).toBeInstanceOf(sdk.IntemptError);
    expect((error as IntemptError).code).toBe(IntemptErrorCode.UnsupportedPlatform);
    expect((error as IntemptError).isUnsupported).toBe(true);
  });

  it('getSdkVersion() rejects the same way instead of crashing', async () => {
    const sdk = importSdkWithNullNativeModule();
    await expect(sdk.getSdkVersion()).rejects.toMatchObject({
      code: IntemptErrorCode.UnsupportedPlatform,
    });
  });

  it('argument validation still runs before the platform check', async () => {
    // A blank sourceId must be reported as MissingConfiguration everywhere —
    // the platform stand-in must not shadow real caller mistakes.
    const sdk = importSdkWithNullNativeModule();
    await expect(sdk.init({ ...CONFIG, sourceId: ' ' })).rejects.toMatchObject({
      code: IntemptErrorCode.MissingConfiguration,
    });
  });
});
