import { nativeReturns, resetNative } from './setup';
import { init, __resetInstanceRegistryForTests } from '../src/index';

const VALID = {
  apiKey: 'prefix.secret',
  orgId: 'org-1',
  projectId: 'proj-1',
  sourceId: 'src-1',
};

function serves(body: unknown) {
  nativeReturns.variation = { value: body };
}

describe('typed variations', () => {
  beforeEach(() => {
    resetNative();
    __resetInstanceRegistryForTests();
  });

  it('boolean: takes a boolean, refuses the string "true"', async () => {
    const sdk = await init(VALID);
    serves(true);
    await expect(sdk.boolVariation('k', {}, false)).resolves.toBe(true);
    serves('true');
    await expect(sdk.boolVariation('k', {}, false)).resolves.toBe(false);
  });

  it('string: takes a string, refuses a number', async () => {
    const sdk = await init(VALID);
    serves('cortex');
    await expect(sdk.stringVariation('k', {}, 'd')).resolves.toBe('cortex');
    serves(42);
    await expect(sdk.stringVariation('k', {}, 'd')).resolves.toBe('d');
  });

  it('number: takes a number, refuses the string "42"', async () => {
    const sdk = await init(VALID);
    serves(42);
    await expect(sdk.numberVariation('k', {}, 0)).resolves.toBe(42);
    serves('42');
    await expect(sdk.numberVariation('k', {}, 0)).resolves.toBe(0);
  });

  it('json: takes an object, refuses a scalar and null', async () => {
    const sdk = await init(VALID);
    serves({ a: 1 });
    await expect(sdk.jsonVariation('k', {}, {})).resolves.toEqual({ a: 1 });
    serves(true);
    await expect(sdk.jsonVariation('k', {}, { d: 1 })).resolves.toEqual({ d: 1 });
    serves(null);
    await expect(sdk.jsonVariation('k', {}, { d: 1 })).resolves.toEqual({ d: 1 });
  });
});
