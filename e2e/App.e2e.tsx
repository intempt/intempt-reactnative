/**
 * End-to-end probe app.
 *
 * Runs the WHOLE stack on a real simulator: JavaScript -> TurboModule bridge ->
 * native SDK -> HTTP -> api.intempt.com. Nothing is mocked. This is the only
 * check in the repo that proves an event actually leaves the device.
 *
 * The assertion is `flush()`, which resolves to the number of events the server
 * ACCEPTED. That is deliberate. `track()` resolving true only means the event
 * reached the queue, and a transport that posts with no Authorization header
 * produces perfectly correct payloads while delivering nothing — that exact bug
 * shipped in intempt-android and lost 100% of events. Asserting on payload
 * shape would have passed on that build.
 *
 * Results are printed as single lines prefixed E2E| so the harness can read
 * them out of the simulator log without a UI driver.
 */

import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { init, ConsentAction } from 'intempt-react-native';
import type { IntemptInstance } from 'intempt-react-native';

type Result = { name: string; ok: boolean; detail: string };

const results: Result[] = [];

function record(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  // eslint-disable-next-line no-console
  console.log(`E2E|${ok ? 'PASS' : 'FAIL'}|${name}|${detail}`);
}

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    record(name, true, await fn());
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}

async function run(): Promise<void> {
  const cfg = {
    apiKey: process.env.INTEMPT_API_KEY ?? '',
    orgId: process.env.INTEMPT_ORG_ID ?? '',
    projectId: process.env.INTEMPT_PROJECT_ID ?? '',
    sourceId: process.env.INTEMPT_SOURCE_ID ?? '',
  };

  if (!cfg.apiKey || !cfg.orgId || !cfg.projectId || !cfg.sourceId) {
    // Skips rather than fails, matching the Swift SDK's live tests: a fork
    // without secrets still gets a green suite.
    // eslint-disable-next-line no-console
    console.log('E2E|SKIP|credentials|no INTEMPT_* in the environment');
    console.log('E2E|DONE|0|0');
    return;
  }

  let sdk: IntemptInstance | undefined;

  await check('init', async () => {
    sdk = await init(cfg);
    return `instance=${sdk.name}`;
  });
  if (!sdk) {
    console.log(`E2E|DONE|${results.filter((r) => r.ok).length}|${results.length}`);
    return;
  }

  const stamp = Date.now();

  await check('identity is minted natively', async () => {
    const profileId = await sdk!.getProfileId();
    const sessionId = await sdk!.getSessionId();
    if (!profileId || !sessionId) throw new Error('empty identity');
    return `profile=${profileId.slice(0, 12)} session=${sessionId.slice(0, 12)}`;
  });

  await check('track accepts typed values', async () => {
    // Numbers and booleans must survive as numbers and booleans. This is the
    // defect the typed contract exists to prevent, and it can only be observed
    // end to end — a JS-side test sees what the bridge was handed, not what the
    // native layer enqueued.
    const queued = await sdk!.track('RN e2e', {
      run: stamp,
      seats: 3,
      trial: false,
      ratio: 0.5,
      at: new Date(),
      nested: { a: 1 },
      list: [1, 2],
    });
    if (!queued) throw new Error('track() returned false — event was dropped');
    return 'queued';
  });

  await check('identify', async () => {
    const ok = await sdk!.identify(`rn-e2e-${stamp}`, {
      userAttributes: { email: `rn-e2e-${stamp}@example.com` },
    });
    if (!ok) throw new Error('identify() returned false');
    return 'queued';
  });

  await check('record uses the frozen argument order', async () => {
    const ok = await sdk!.record('RN e2e record', {
      userId: `rn-e2e-${stamp}`,
      accountId: `rn-e2e-acct-${stamp}`,
      data: { mrr: 120 },
    });
    if (!ok) throw new Error('record() returned false');
    return 'queued';
  });

  await check('commerce', async () => {
    const ok =
      (await sdk!.productView('rn-e2e-sku')) &&
      (await sdk!.productAdd('rn-e2e-sku', 2)) &&
      (await sdk!.productOrdered([{ productId: 'rn-e2e-sku', quantity: 2 }]));
    if (!ok) throw new Error('a commerce call returned false');
    return 'queued';
  });

  // THE assertion. Everything above proves the queue accepted an event; this
  // proves the server did.
  await check('flush delivers to api.intempt.com', async () => {
    const delivered = await sdk!.flush();
    if (delivered < 1) {
      throw new Error(
        `flush() delivered ${delivered} events — queued but never accepted`
      );
    }
    return `delivered=${delivered}`;
  });

  await check('consent transmits even when opted out', async () => {
    // Contractual: a withdrawal must reach the server, so consent is sent on
    // its own endpoint regardless of opt-out state.
    await sdk!.optOut();
    const ok = await sdk!.consent(
      ConsentAction.Reject,
      Math.floor(Date.now() / 1000) + 86400,
      { category: 'rn-e2e' }
    );
    if (!ok) throw new Error('consent() returned false while opted out');
    await sdk!.optIn();
    return 'accepted while opted out';
  });

  await check('optOut discards the queue', async () => {
    await sdk!.track('should not survive opt-out', { run: stamp });
    await sdk!.optOut();
    const delivered = await sdk!.flush();
    await sdk!.optIn();
    if (delivered !== 0) {
      throw new Error(
        `flush() delivered ${delivered} after optOut — the queue was not discarded`
      );
    }
    return 'queue emptied';
  });

  await check('reset rotates identity', async () => {
    const before = await sdk!.getProfileId();
    await sdk!.reset();
    const after = await sdk!.getProfileId();
    if (before === after) throw new Error('profileId did not change after reset()');
    return 'rotated';
  });

  const passed = results.filter((r) => r.ok).length;
  // eslint-disable-next-line no-console
  console.log(`E2E|DONE|${passed}|${results.length}`);
}

export default function App(): React.JSX.Element {
  const [line, setLine] = useState('running…');

  useEffect(() => {
    run()
      .then(() => setLine(`${results.filter((r) => r.ok).length}/${results.length}`))
      .catch((e) => {
        // eslint-disable-next-line no-console
        console.log(`E2E|FAIL|harness|${e}`);
        console.log(`E2E|DONE|0|${results.length || 1}`);
        setLine('harness error');
      });
  }, []);

  return (
    <View>
      <Text testID="e2e-status">{line}</Text>
    </View>
  );
}
