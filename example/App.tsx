/**
 * Intempt React Native example app.
 *
 * Two jobs, deliberately in one app:
 *
 *  1. **Something a developer can run.** Buttons that fire each contract method
 *     against a real project, with the result of every call on screen. This is
 *     the artefact the other SDKs already have — Android's `:sample`,
 *     `intempt-swift/IntemptDemo` — and React Native did not.
 *
 *  2. **The end-to-end probe.** With `EXPO_PUBLIC_INTEMPT_E2E=1` the app runs
 *     the full suite on mount and writes results to a FILE.
 *
 * The file matters. The previous probe reported through `console.log`, which
 * does not reach `os_log` in a `--dev false` bundle — so CI captured nothing
 * while the app ran perfectly (issue #6). A throwaway scaffolded app could not
 * fix that, because it cannot carry a filesystem dependency. A committed app
 * can, and `expo-file-system` writes somewhere `simctl get_app_container` can
 * read afterwards, with no timing race at all.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { File, Paths } from 'expo-file-system';
import { ConsentAction, IntemptError, init } from 'intempt-react-native';
import type { IntemptInstance } from 'intempt-react-native';

const CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_INTEMPT_API_KEY ?? '',
  orgId: process.env.EXPO_PUBLIC_INTEMPT_ORG_ID ?? '',
  projectId: process.env.EXPO_PUBLIC_INTEMPT_PROJECT_ID ?? '',
  sourceId: process.env.EXPO_PUBLIC_INTEMPT_SOURCE_ID ?? '',
};

const E2E_MODE = process.env.EXPO_PUBLIC_INTEMPT_E2E === '1';
const RESULTS_FILE = 'intempt-e2e-results.txt';

type Line = { ok: boolean; label: string; detail: string };

function describe(error: unknown): string {
  if (error instanceof IntemptError) {
    // isUnsupported is the interesting case on Android until 3.0 covers push.
    return `${error.code}${error.isUnsupported ? ' (not on this platform)' : ''}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export default function App(): React.JSX.Element {
  const dark = useColorScheme() === 'dark';
  const [sdk, setSdk] = useState<IntemptInstance | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [status, setStatus] = useState('starting…');

  const log = useCallback((ok: boolean, label: string, detail: string) => {
    setLines((prev) => [{ ok, label, detail }, ...prev]);
  }, []);

  const run = useCallback(
    async (label: string, fn: () => Promise<unknown>) => {
      try {
        const value = await fn();
        log(true, label, value === undefined ? 'ok' : String(value));
        return true;
      } catch (error) {
        log(false, label, describe(error));
        return false;
      }
    },
    [log]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!CONFIG.apiKey) {
        setStatus('no credentials — set EXPO_PUBLIC_INTEMPT_* and rebuild');
        if (E2E_MODE) await writeResults([], 'SKIP');
        return;
      }
      try {
        const instance = await init(CONFIG);
        if (cancelled) return;
        setSdk(instance);
        setStatus(`ready — instance "${instance.name}" on ${Platform.OS}`);
        if (E2E_MODE) await runProbe(instance, setStatus);
      } catch (error) {
        setStatus(`init failed — ${describe(error)}`);
        if (E2E_MODE) await writeResults([{ ok: false, label: 'init', detail: describe(error) }], 'DONE');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const actions: Array<[string, () => Promise<unknown>]> = sdk
    ? [
        ['track', () => sdk.track('Example tapped', { source: 'example-app', count: 1, ok: true })],
        ['identify', () => sdk.identify(`example-${Date.now()}`, { userAttributes: { plan: 'demo' } })],
        ['group', () => sdk.group(`acct-${Date.now()}`, { accountAttributes: { tier: 'demo' } })],
        ['record', () => sdk.record('Example record', { userId: 'example-user', data: { mrr: 10 } })],
        ['productView', () => sdk.productView('sku-example')],
        ['productAdd', () => sdk.productAdd('sku-example', 2)],
        ['consent accept', () => sdk.consent(ConsentAction.Accept, Math.floor(Date.now() / 1000) + 86400)],
        ['flush', () => sdk.flush().then((n: number) => `${n} delivered`)],
        ['getProfileId', () => sdk.getProfileId()],
        ['getSessionId', () => sdk.getSessionId()],
        ['optOut', () => sdk.optOut()],
        ['optIn', () => sdk.optIn()],
        ['reset', () => sdk.reset()],
        ['autocapture on', async () => {
          await sdk.autocapture.configure({ screenViews: true, controlInteractions: true });
          await sdk.autocapture.start();
          return 'started';
        }],
        ['products', () => sdk
            .products({ feedId: 'demo-feed', count: 3 })
            .then((p: unknown[]) => `${p.length} items`)],

        // Flags. Ask for a KEY — whether it names an experiment, a personalization or a flag is
        // the platform's business, and these calls do not change when that does.
        //
        // The default is not optional and it is a real decision: it is what renders when Intempt
        // cannot be reached. Choose the behaviour you already have.
        ['variation', () => sdk
            .boolVariation('new_checkout', { userId: 'user-123' }, false)
            .then((on: boolean) => `new_checkout = ${on}`)],

        // The reason separates a deliberate holdout from an outage. Without it both are the same
        // absent value and you cannot tell a rollout decision from a failure.
        ['variationDetail', () => sdk
            .variationDetail('pricing_cta', { userId: 'user-123' }, 'Get started')
            .then((d: { value: unknown; reason: string; variant?: string }) =>
              `${d.value} (reason=${d.reason}, variant=${d.variant ?? 'none'})`)],

        ['allFlags', () => sdk
            .allFlags({ userId: 'user-123' })
            .then((f: Record<string, unknown>) => `${Object.keys(f).length} key(s)`)],
      ]
    : [];

  const theme = dark ? styles.dark : styles.light;

  return (
    <View style={[styles.root, theme]}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Text style={[styles.title, theme]}>Intempt · React Native</Text>
      <Text style={[styles.status, theme]} testID="status">
        {status}
      </Text>

      <ScrollView contentContainerStyle={styles.buttons} horizontal={false}>
        <View style={styles.grid}>
          {actions.map(([label, fn]) => (
            <Pressable
              key={label}
              testID={`btn-${label}`}
              style={({ pressed }) => [styles.button, pressed && styles.pressed]}
              onPress={() => run(label, fn)}
            >
              <Text style={styles.buttonText}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {lines.map((l, i) => (
          <Text key={i} style={[styles.line, l.ok ? styles.ok : styles.bad]}>
            {l.ok ? '✓' : '✗'} {l.label} — {l.detail}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * The end-to-end suite. Assertions match the contract's stated behaviours,
 * and the one that matters is `flush()` — the number of events the SERVER
 * accepted. `track()` returning true only means the queue took it, and a
 * transport posting without an Authorization header produces perfectly correct
 * payloads while delivering nothing. That bug shipped in intempt-android.
 */
async function runProbe(
  sdk: IntemptInstance,
  setStatus: (s: string) => void
): Promise<void> {
  const out: Line[] = [];
  const stamp = Date.now();

  const check = async (label: string, fn: () => Promise<string>) => {
    try {
      out.push({ ok: true, label, detail: await fn() });
    } catch (error) {
      out.push({ ok: false, label, detail: describe(error) });
    }
  };

  await check('identity is minted natively', async () => {
    const [profileId, sessionId] = await Promise.all([sdk.getProfileId(), sdk.getSessionId()]);
    if (!profileId || !sessionId) {
      throw new Error(`empty identity (profile="${profileId}", session="${sessionId}")`);
    }
    return `profile=${profileId.slice(0, 12)}`;
  });

  await check('typed values survive the bridge', async () => {
    // Numbers and booleans must stay numbers and booleans. Only observable end
    // to end — a JS test sees what the bridge was handed, not what native
    // enqueued.
    const ok = await sdk.track('RN e2e', {
      run: stamp, seats: 3, trial: false, ratio: 0.5,
      at: new Date(), nested: { a: 1 }, list: [1, 2],
    });
    if (!ok) throw new Error('track() returned false');
    return 'queued';
  });

  await check('identify', async () => {
    if (!(await sdk.identify(`rn-e2e-${stamp}`, { userAttributes: { email: `rn-${stamp}@example.com` } }))) {
      throw new Error('identify() returned false');
    }
    return 'queued';
  });

  await check('group', async () => {
    if (!(await sdk.group(`rn-acct-${stamp}`, { accountAttributes: { tier: 'e2e' } }))) {
      throw new Error('group() returned false');
    }
    return 'queued';
  });

  await check('alias', async () => {
    if (!(await sdk.alias(`rn-e2e-${stamp}`, `rn-e2e-alias-${stamp}`))) {
      throw new Error('alias() returned false');
    }
    return 'queued';
  });

  await check('record uses the frozen argument order', async () => {
    if (!(await sdk.record('RN e2e record', {
      userId: `rn-e2e-${stamp}`, accountId: `rn-acct-${stamp}`, data: { mrr: 120 },
    }))) throw new Error('record() returned false');
    return 'queued';
  });

  await check('commerce', async () => {
    const ok = (await sdk.productView('rn-e2e-sku'))
      && (await sdk.productAdd('rn-e2e-sku', 2))
      && (await sdk.productOrdered([{ productId: 'rn-e2e-sku', quantity: 2 }]));
    if (!ok) throw new Error('a commerce call returned false');
    return 'queued';
  });

  await check('flush delivers to api.intempt.com', async () => {
    const delivered = await sdk.flush();
    if (delivered < 1) throw new Error(`delivered ${delivered} — queued but never accepted`);
    return `delivered=${delivered}`;
  });

  await check('consent transmits even when opted out', async () => {
    await sdk.optOut();
    const ok = await sdk.consent(ConsentAction.Reject, Math.floor(Date.now() / 1000) + 86400, {
      category: 'rn-e2e',
    });
    await sdk.optIn();
    if (!ok) throw new Error('consent() returned false while opted out');
    return 'accepted while opted out';
  });

  await check('optOut discards the queue', async () => {
    await sdk.track('should not survive opt-out', { run: stamp });
    await sdk.optOut();
    const delivered = await sdk.flush();
    await sdk.optIn();
    if (delivered !== 0) throw new Error(`delivered ${delivered} after optOut`);
    return 'queue emptied';
  });

  await check('reset rotates identity', async () => {
    const before = await sdk.getProfileId();
    await sdk.reset();
    if ((await sdk.getProfileId()) === before) throw new Error('profileId unchanged');
    return 'rotated';
  });

  const passed = out.filter((l) => l.ok).length;
  setStatus(`e2e ${passed}/${out.length}`);
  await writeResults(out, 'DONE');
}

/**
 * Writes results where CI can read them without racing a log stream.
 *
 * This is the whole reason the example app is committed rather than scaffolded
 * per-run: a throwaway app cannot depend on expo-file-system, so its only
 * reporting channel was console.log — which is silent in a release bundle.
 */
async function writeResults(lines: Line[], marker: 'DONE' | 'SKIP'): Promise<void> {
  const passed = lines.filter((l) => l.ok).length;
  const body = [
    ...lines.map((l) => `E2E|${l.ok ? 'PASS' : 'FAIL'}|${l.label}|${l.detail}`),
    marker === 'SKIP' ? 'E2E|SKIP|credentials|none in the environment' : `E2E|DONE|${passed}|${lines.length}`,
  ].join('\n');

  // eslint-disable-next-line no-console
  console.log(body);

  try {
    // expo-file-system 19 removed `documentDirectory` and
    // `writeAsStringAsync` in favour of File/Paths. The legacy names still
    // exist under `expo-file-system/legacy`, but new code should not start
    // there.
    new File(Paths.document, RESULTS_FILE).write(body);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.log(`E2E|FAIL|write-results|${describe(error)}`);
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingTop: 64, paddingHorizontal: 16 },
  light: { backgroundColor: '#ffffff', color: '#111111' },
  dark: { backgroundColor: '#111111', color: '#f5f5f5' },
  title: { fontSize: 22, fontWeight: '600', marginBottom: 4 },
  status: { fontSize: 13, opacity: 0.7, marginBottom: 16 },
  buttons: { paddingBottom: 48 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  button: { backgroundColor: '#2563eb', paddingVertical: 9, paddingHorizontal: 13, borderRadius: 8 },
  pressed: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 13, fontWeight: '500' },
  line: { fontSize: 12, marginBottom: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  ok: { color: '#16a34a' },
  bad: { color: '#dc2626' },
});
