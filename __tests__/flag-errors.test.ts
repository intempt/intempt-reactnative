/**
 * onFlagError, bridged (Beso 2026-11-27). The native SDKs call it for every failed flag request
 * with a FlagError {key, kind, status}; the bridge forwards it as an event per instance.
 */

import { DeviceEventEmitter } from 'react-native';
import { nativeCalls } from './setup';
import { init, __resetInstanceRegistryForTests } from '../src/index';
import type { FlagError } from '../src/index';

async function sdk(instanceName?: string) {
  const instance = await init({
    apiKey: 'prefix.secret',
    orgId: 'org-1',
    projectId: 'proj-1',
    sourceId: 'src-1',
    ...(instanceName ? { instanceName } : {}),
  });
  nativeCalls.length = 0;
  return instance;
}

const EVENT = 'IntemptFlagError';

beforeEach(() => __resetInstanceRegistryForTests());

describe('onFlagError', () => {
  it('turns the native listener on, and forwards this instance’s errors', async () => {
    const s = await sdk();
    const seen: FlagError[] = [];
    s.onFlagError = (error) => seen.push(error);

    expect(nativeCalls.filter((c) => c.fn === 'setFlagErrorListener')).toEqual([
      { fn: 'setFlagErrorListener', args: ['default', true] },
    ]);
    DeviceEventEmitter.emit(EVENT, { instanceName: 'default', key: 'banner', kind: 'server', status: 503 });
    DeviceEventEmitter.emit(EVENT, { instanceName: 'default', key: null, kind: 'network' });
    expect(seen).toEqual([
      { key: 'banner', kind: 'server', status: 503 },
      { key: null, kind: 'network' },
    ]);
    expect(s.onFlagError).toBeDefined();
    s.onFlagError = null;
  });

  it('ignores another instance’s errors', async () => {
    const s = await sdk();
    const seen: unknown[] = [];
    s.onFlagError = (error) => seen.push(error);
    DeviceEventEmitter.emit(EVENT, { instanceName: 'other', key: 'banner', kind: 'server' });
    expect(seen).toEqual([]);
    s.onFlagError = null;
  });

  it('clearing it turns the native listener off and stops forwarding', async () => {
    const s = await sdk();
    const seen: unknown[] = [];
    s.onFlagError = (error) => seen.push(error);
    nativeCalls.length = 0;
    s.onFlagError = null;

    expect(nativeCalls.filter((c) => c.fn === 'setFlagErrorListener')).toEqual([
      { fn: 'setFlagErrorListener', args: ['default', false] },
    ]);
    DeviceEventEmitter.emit(EVENT, { instanceName: 'default', key: 'banner', kind: 'server' });
    expect(seen).toEqual([]);
    expect(s.onFlagError).toBeNull();
  });

  it('replacing it keeps one subscription', async () => {
    const s = await sdk();
    const first: unknown[] = [];
    const second: unknown[] = [];
    s.onFlagError = (error) => first.push(error);
    s.onFlagError = (error) => second.push(error);
    DeviceEventEmitter.emit(EVENT, { instanceName: 'default', key: 'k', kind: 'timeout' });
    expect(first).toEqual([]);
    expect(second).toHaveLength(1);
    s.onFlagError = null;
  });

  it('a hook that throws does not break the emitter', async () => {
    const s = await sdk();
    s.onFlagError = () => {
      throw new Error('app bug');
    };
    expect(() =>
      DeviceEventEmitter.emit(EVENT, { instanceName: 'default', key: 'k', kind: 'parse' })
    ).not.toThrow();
    s.onFlagError = null;
  });

  it('starts unset', async () => {
    const s = await sdk();
    expect(s.onFlagError).toBeNull();
    expect(nativeCalls).toEqual([]);
  });
});
