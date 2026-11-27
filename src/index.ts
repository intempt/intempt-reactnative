/**
 * Intempt SDK for React Native.
 *
 * Wraps intempt-swift on iOS and intempt-android on Android. The surface here
 * is defined by intempt-swift/docs/SDK-API-CONTRACT.md, not by either native
 * SDK's current state.
 *
 * This layer holds no analytics state. It validates arguments, converts the
 * types the bridge cannot carry, and forwards. Queueing, retry, persistence and
 * identity all live natively.
 */

import NativeIntemptOrNull from './NativeIntempt';
import type { Spec } from './NativeIntempt';
import { IntemptError, IntemptErrorCode, fromNativeRejection } from './errors';
import {
  ConsentAction,
  DEFAULT_FEED_FIELDS,
} from './types';
import type {
  AutocaptureOptions,
  AutomaticEventOptions,
  Choice,
  ChooseOptions,
  FlagContext,
  FlagDetail,
  FlagErrorCode,
  FlagReadOptions,
  FlagReason,
  FlagRequestError,
  IntemptConfig,
  IntemptProperties,
  IntemptValue,
  OrderedProduct,
  ProductRecommendation,
  ProductsQuery,
} from './types';

export {
  ConsentAction,
  DEFAULT_FEED_FIELDS,
  IntemptError,
  IntemptErrorCode,
};
export type {
  AutocaptureOptions,
  AutomaticEventOptions,
  Choice,
  ChooseOptions,
  FlagContext,
  FlagDetail,
  FlagErrorCode,
  FlagReadOptions,
  FlagReason,
  FlagRequestError,
  IntemptConfig,
  IntemptProperties,
  IntemptValue,
  OrderedProduct,
  ProductRecommendation,
  ProductsQuery,
};

const DEFAULT_INSTANCE = 'default';

/**
 * The native module, or a stand-in that rejects every call.
 *
 * On Android and iOS the TurboModule exists and this is a plain pass-through.
 * Anywhere else — react-native-web, react-native-windows/macos — the module is
 * null, and every method (including `initialize`) rejects with
 * `UnsupportedPlatform`, whose `isUnsupported` is true. That turns "wrong
 * platform" from a crash at import time into the same catchable shape as a
 * method-level platform gap: `init()` rejects, the app keeps running, and the
 * caller can branch on `error.isUnsupported` to fall back to another SDK.
 */
const NativeIntempt: Spec =
  NativeIntemptOrNull ??
  new Proxy({} as Spec, {
    get(_target, prop) {
      return (): Promise<never> =>
        Promise.reject(
          new IntemptError(
            IntemptErrorCode.UnsupportedPlatform,
            'The Intempt native module is not available on this platform. ' +
              'This SDK supports Android and iOS only; for web use intemptjs, ' +
              'for servers use the Node.js SDK.',
            { method: String(prop) }
          )
        );
    },
  });

/**
 * Prepares a value for the bridge.
 *
 * `Date` has no bridge representation, so it crosses as ISO 8601 and the native
 * side re-types it. Everything else the bridge already carries — including
 * numbers and booleans, which must NOT be stringified here. Android's pre-3.0
 * `Map<String, String>` surface stringified them natively, which is precisely
 * the defect the typed contract exists to fix; doing it in JavaScript instead
 * would hide the problem rather than solve it.
 */
function encodeValue(value: IntemptValue): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(encodeValue);
  }
  // EQUIVALENT MUTANT on the null guard. `typeof null === 'object'`, so replacing this operand
  // with `true` sends null into encodeProperties(null), which returns null — the same value the
  // fall-through returns, by a different route. No input distinguishes the two.
  // Stryker disable next-line ConditionalExpression: equivalent, see the note above
  if (value !== null && typeof value === 'object') {
    return encodeProperties(value);
  }
  return value;
}

/** Applies `encodeValue` across a map, preserving null vs undefined. */
function encodeProperties(
  properties: IntemptProperties | null | undefined
): Record<string, unknown> | null {
  if (properties === null || properties === undefined) {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    // An explicit null is meaningful — it clears an attribute. An undefined is
    // an absent key, and forwarding it as null would clear something the caller
    // never mentioned.
    if (value !== undefined) {
      out[key] = encodeValue(value);
    }
  }
  return out;
}

/** Rejects with a real error rather than passing a blank identifier to native. */
function requireNonBlank(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new IntemptError(
      IntemptErrorCode.MissingConfiguration,
      `${field} must be a non-empty string`,
      { method: 'init' }
    );
  }
}

/** A non-object context sends none; the native SDK then fills in the device's profileId. */
function flagContext(context: unknown): object {
  return typeof context === 'object' && context !== null ? context : {};
}

interface NativeFlagMap {
  id?: unknown;
  keys?: unknown;
}

/**
 * The allFlags answer: the served keys, each value fetched from the native map on first read.
 *
 * Both native SDKs record an exposure when a value is read from their allFlags map, so the map
 * stays native and only a key the app reads crosses the bridge. Anything malformed is an empty
 * answer: a flag read never throws into a render.
 */
function exposingFlags(served: unknown): Record<string, unknown> {
  const { id, keys } = (served ?? {}) as NativeFlagMap;
  const listed = typeof id === 'string' && Array.isArray(keys) ? keys : [];
  const flags: Record<string, unknown> = {};
  for (const key of listed) {
    // defineProperty, not assignment: a served `__proto__` key must be an own property.
    Object.defineProperty(flags, String(key), {
      value: undefined,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  const fetched = new Set<PropertyKey>();
  return new Proxy(flags, {
    get(target, property, receiver) {
      if (
        // Stryker disable next-line ConditionalExpression: equivalent, a symbol is never an own key here so hasOwnProperty rejects it too; the typeof narrows for tsc
        typeof property === 'string' &&
        Object.prototype.hasOwnProperty.call(target, property) &&
        !fetched.has(property)
      ) {
        fetched.add(property);
        target[property] = nativeFlagValue(id as string, property);
      }
      return Reflect.get(target, property, receiver) as unknown;
    },
    set(target, property, value, receiver) {
      // A value the caller wrote is theirs: no later read may replace it with the served one.
      fetched.add(property);
      return Reflect.set(target, property, value, receiver);
    },
  });
}

function nativeFlagValue(mapId: string, key: string): unknown {
  try {
    // A null answer throws here and so reads as absent, like any failed read.
    return (NativeIntempt.flagValue(mapId, key) as { value?: unknown }).value;
  }
  // Stryker disable next-line BlockStatement: equivalent, an emptied catch also returns undefined
  catch {
    return undefined;
  }
}

/**
 * One configured Intempt instance.
 *
 * Obtained from `Intempt.init()`. Multiple named instances coexist; each has
 * its own credentials, queue and identity.
 */
export class IntemptInstance {
  /** @internal */
  constructor(
    private readonly instanceName: string,
    /**
     * What this instance was initialised with, or undefined when the choice was left to
     * the platform. Readable so a caller can check which value is in force after a
     * second init returned the cached instance rather than applying a new one.
     */
    readonly useIpAddressForGeolocation?: boolean,
  ) {}

  /** The name this instance was registered under. */
  get name(): string {
    return this.instanceName;
  }

  private async call<T>(method: string, invoke: () => Promise<T>): Promise<T> {
    try {
      return await invoke();
    } catch (error) {
      throw fromNativeRejection(error, method);
    }
  }

  // MARK: - Capture

  /**
   * Records an event.
   *
   * Resolves to whether the event was accepted into the queue. False means
   * dropped — opted out, invalid property, encoding failure, storage
   * unavailable. It does not mean delivered.
   */
  track(eventTitle: string, data?: IntemptProperties): Promise<boolean> {
    return this.call('track', () =>
      NativeIntempt.track(this.instanceName, eventTitle, encodeProperties(data))
    );
  }

  /** Associates the current profile with a known user id. */
  identify(
    userId: string,
    options: {
      eventTitle?: string;
      userAttributes?: IntemptProperties;
      data?: IntemptProperties;
    } = {}
  ): Promise<boolean> {
    return this.call('identify', () =>
      NativeIntempt.identify(
        this.instanceName,
        userId,
        // Not defaulted. "identify" is a reserved event name on the native
        // side and the match is case-insensitive, so sending "Identify" makes
        // the call fail validation and queue nothing. Both SDKs name the event
        // themselves when this is absent.
        options.eventTitle ?? null,
        encodeProperties(options.userAttributes),
        encodeProperties(options.data)
      )
    );
  }

  /**
   * Associates the current profile with an account.
   *
   * Note `accountAttributes` — the deprecated Objective-C SDK named this
   * parameter `userAttributes` while sending an account, which is why the
   * contract names it explicitly.
   */
  group(
    accountId: string,
    options: { eventTitle?: string; accountAttributes?: IntemptProperties } = {}
  ): Promise<boolean> {
    return this.call('group', () =>
      NativeIntempt.group(
        this.instanceName,
        accountId,
        // Same reservation as identify(): the SDKs name an untitled group event
        // themselves ("Identify" on both from intempt-android 7.0.0).
        options.eventTitle ?? null,
        encodeProperties(options.accountAttributes)
      )
    );
  }

  /**
   * Records an event against a user, an account, or both.
   *
   * Argument order follows the contract: user-level identifier before
   * account-level, matching every other method. Android ordered these the other
   * way before 3.0.
   */
  record(
    eventTitle: string,
    options: {
      userId?: string;
      accountId?: string;
      data?: IntemptProperties;
      userAttributes?: IntemptProperties;
      accountAttributes?: IntemptProperties;
    } = {}
  ): Promise<boolean> {
    return this.call('record', () =>
      NativeIntempt.record(
        this.instanceName,
        eventTitle,
        options.userId ?? null,
        options.accountId ?? null,
        encodeProperties(options.data),
        encodeProperties(options.userAttributes),
        encodeProperties(options.accountAttributes)
      )
    );
  }

  // MARK: - Commerce

  productAdd(productId: string, quantity: number): Promise<boolean> {
    return this.call('productAdd', () =>
      NativeIntempt.productAdd(this.instanceName, productId, quantity)
    );
  }

  productView(productId: string): Promise<boolean> {
    return this.call('productView', () =>
      NativeIntempt.productView(this.instanceName, productId)
    );
  }

  productOrdered(products: OrderedProduct[]): Promise<boolean> {
    return this.call('productOrdered', () =>
      NativeIntempt.productOrdered(
        this.instanceName,
        products.map((p) => ({ productId: p.productId, quantity: p.quantity }))
      )
    );
  }

  // MARK: - Consent

  /**
   * Records a consent decision.
   *
   * Three behaviours are contractual rather than incidental: consent transmits
   * even when opted out, because a withdrawal must reach the server; it goes to
   * its own endpoint unbatched; and `reject` opts out while `accept` opts in.
   *
   * @param validUntil Unix seconds the decision is valid until.
   */
  consent(
    action: ConsentAction,
    validUntil: number,
    options: { email?: string; message?: string; category?: string } = {}
  ): Promise<boolean> {
    return this.call('consent', () =>
      NativeIntempt.consent(
        this.instanceName,
        action,
        validUntil,
        options.email ?? null,
        options.message ?? null,
        options.category ?? null
      )
    );
  }

  // MARK: - Identity

  getProfileId(): Promise<string> {
    return this.call('getProfileId', () =>
      NativeIntempt.getProfileId(this.instanceName)
    );
  }

  getSessionId(): Promise<string> {
    return this.call('getSessionId', () =>
      NativeIntempt.getSessionId(this.instanceName)
    );
  }

  /**
   * Rotates the anonymous identity, keeping the queue.
   *
   * Distinct from `reset()`: this exists so the next user of a shared device
   * cannot inherit the previous identity, without discarding events already
   * collected and not yet delivered.
   */
  logOut(): Promise<void> {
    return this.call('logOut', () => NativeIntempt.logOut(this.instanceName));
  }

  /** New anonymous identity and an empty queue. */
  reset(): Promise<void> {
    return this.call('reset', () => NativeIntempt.reset(this.instanceName));
  }

  // MARK: - Opt in / out

  optIn(): Promise<void> {
    return this.call('optIn', () => NativeIntempt.optIn(this.instanceName));
  }

  /**
   * Stops collection and discards everything already collected.
   *
   * Merely setting a flag would leave events collected before the objection to
   * be uploaded after it. Queued consent records are deliberately preserved —
   * they are the evidence of the user's decision.
   */
  optOut(): Promise<void> {
    return this.call('optOut', () => NativeIntempt.optOut(this.instanceName));
  }

  hasOptedOut(): Promise<boolean> {
    return this.call('hasOptedOut', () =>
      NativeIntempt.hasOptedOut(this.instanceName)
    );
  }

  /** Convenience inverse of `hasOptedOut()`. */
  async isOptedIn(): Promise<boolean> {
    return !(await this.hasOptedOut());
  }

  // MARK: - Delivery

  /** Sends everything queued now. Resolves to the number of events delivered. */
  flush(): Promise<number> {
    return this.call('flush', () => NativeIntempt.flush(this.instanceName));
  }

  /** Seconds between automatic flushes. */
  getFlushInterval(): Promise<number> {
    return this.call('getFlushInterval', () =>
      NativeIntempt.getFlushInterval(this.instanceName)
    );
  }

  /** Seconds between automatic flushes. 0 disables the timer. */
  setFlushInterval(seconds: number): Promise<void> {
    return this.call('setFlushInterval', () =>
      NativeIntempt.setFlushInterval(this.instanceName, seconds)
    );
  }

  // MARK: - Flags

  /**
   * The flag's value for `key`, or `defaultValue` when it was not served or the read failed.
   * Flags only: an experiment or personalization is read with `choose`.
   *
   * One native read (`/flags/evaluate`, which records the exposure; a 60 s cache while the flag
   * stream is connected). Never throws for a bad key, context or service failure (S11):
   * `variationDetail` says why the default came back.
   */
  async variation<T>(
    key: string,
    context: FlagContext | undefined,
    defaultValue: T,
    options?: FlagReadOptions
  ): Promise<T> {
    return (await this.variationDetail(key, context, defaultValue, options)).value;
  }

  /**
   * `variation` plus why: the native SDK's reason, error code and served variation. A served value
   * whose type does not match `defaultValue` answers the default with `TYPE_MISMATCH`; a null or
   * undefined default accepts any type.
   */
  async variationDetail<T>(
    key: string,
    context: FlagContext | undefined,
    defaultValue: T,
    options?: FlagReadOptions
  ): Promise<FlagDetail<T>> {
    if (typeof key !== 'string') {
      // Native answers an invalid key this way too; a non-string cannot cross the bridge to it.
      return { value: defaultValue, reason: 'error', errorCode: 'FLAG_NOT_FOUND' };
    }
    const answer = (await this.call('variationDetail', () =>
      NativeIntempt.variationDetail(
        this.instanceName,
        key,
        flagContext(context),
        { value: defaultValue ?? null },
        options?.disableExposure === true
      )
    )) as Partial<FlagDetail<T>> | null;
    if (answer == null || typeof answer.reason !== 'string') {
      return { value: defaultValue, reason: 'error', errorCode: 'GENERAL' };
    }
    // The default crossed the bridge as a copy: hand back the caller's own value, not the copy.
    const value = answer.errorCode === undefined && answer.value !== undefined ? answer.value : defaultValue;
    return { ...answer, value } as FlagDetail<T>;
  }

  /**
   * The experiences and personalizations served to this person (`/optimization/choose-api`),
   * filtered by `names` and `groups`. Records each one's exposure unless `disableExposure`.
   * Never rejects for a service failure: the native SDKs answer an empty list.
   */
  async choose(context?: FlagContext, options?: ChooseOptions): Promise<Choice[]> {
    const request: Record<string, unknown> = { disableExposure: options?.disableExposure === true };
    if (options?.names !== undefined) request.names = options.names;
    if (options?.groups !== undefined) request.groups = options.groups;
    const choices = await this.call('choose', () =>
      NativeIntempt.choose(this.instanceName, flagContext(context), request)
    );
    return Array.isArray(choices) ? (choices as Choice[]) : [];
  }

  /**
   * Every flag served to this person, in one call that records no exposure.
   *
   * Reading a key's value records that flag's exposure, once per returned object (intempt-node's
   * allFlags, F32). `Object.keys` and `in` record nothing; a spread, `Object.entries` or
   * `JSON.stringify` reads, and so exposes, every key.
   */
  async allFlags(context?: FlagContext): Promise<Record<string, unknown>> {
    const served = await this.call('allFlags', () =>
      NativeIntempt.allFlags(this.instanceName, flagContext(context))
    );
    return exposingFlags(served);
  }

  /** A boolean flag. A served value of another type answers `defaultValue` (TYPE_MISMATCH). */
  async boolVariation(
    key: string,
    context: FlagContext | undefined,
    defaultValue: boolean,
    options?: FlagReadOptions
  ): Promise<boolean> {
    const value = await this.variation<unknown>(key, context, defaultValue, options);
    // The native SDK already checks the type; this keeps a wrong answer from ever being coerced.
    return typeof value === 'boolean' ? value : defaultValue;
  }

  async stringVariation(
    key: string,
    context: FlagContext | undefined,
    defaultValue: string,
    options?: FlagReadOptions
  ): Promise<string> {
    const value = await this.variation<unknown>(key, context, defaultValue, options);
    return typeof value === 'string' ? value : defaultValue;
  }

  async numberVariation(
    key: string,
    context: FlagContext | undefined,
    defaultValue: number,
    options?: FlagReadOptions
  ): Promise<number> {
    const value = await this.variation<unknown>(key, context, defaultValue, options);
    // EQUIVALENT MUTANT on the typeof operand. Number.isFinite does not coerce — unlike the
    // global isFinite — so it returns true only for values already of type number, and the
    // operand cannot change the outcome. It is not removable: Number.isFinite carries no type
    // predicate, so without it tsc reports "Type 'unknown' is not assignable to type 'number'".
    // Stryker disable next-line ConditionalExpression: equivalent, see the note above
    return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
  }

  /** A JSON flag: any served JSON value; the default only when nothing usable was served. */
  jsonVariation<T = unknown>(
    key: string,
    context: FlagContext | undefined,
    defaultValue: T,
    options?: FlagReadOptions
  ): Promise<T> {
    return this.variation(key, context, defaultValue, options);
  }

  /**
   * Resolves immediately.
   *
   * Present so the cross-SDK surface is the same everywhere, and so a caller porting from an SDK
   * that polls a local flag store does not have to remove the call. Neither native SDK loads a flag
   * store before it can answer: a read asks the server, or a cache that read filled.
   */
  waitForInitialization(timeoutMs?: number): Promise<void> {
    // Not `async`: there is nothing to await, and marking it so only to satisfy a shape trips
    // require-await. The parameter is part of the cross-SDK signature and is referenced rather
    // than suppressed — a lint disable is a claim that stops being true if this grows a body.
    void timeoutMs;
    return Promise.resolve();
  }

  // MARK: - Personalization


  /**
   * Recommended products from a configured feed.
   *
   * `fields` defaults to a compact set on purpose. An unfielded request returns
   * every catalog column including raw ML embedding vectors — 443x the payload
   * for the same 10 products. Widen it deliberately.
   */
  products(query: ProductsQuery): Promise<ProductRecommendation[]> {
    return this.call('products', () =>
      NativeIntempt.products(
        this.instanceName,
        query.feedId,
        query.count ?? 10,
        query.fields ?? [...DEFAULT_FEED_FIELDS],
        query.productId ?? null
      )
    ) as Promise<ProductRecommendation[]>;
  }

  // MARK: - Automatic events

  getAutomaticEvents(): Promise<AutomaticEventOptions> {
    return this.call('getAutomaticEvents', () =>
      NativeIntempt.getAutomaticEvents(this.instanceName)
    ) as Promise<AutomaticEventOptions>;
  }

  /**
   * Which lifecycle events the SDK emits on its own.
   *
   * Only sessions are on by default. An SDK that silently starts writing events
   * the integrator never asked for is how an event-volume bill surprises
   * someone.
   */
  setAutomaticEvents(options: AutomaticEventOptions): Promise<void> {
    return this.call('setAutomaticEvents', () =>
      NativeIntempt.setAutomaticEvents(this.instanceName, options)
    );
  }

  // MARK: - Autocapture

  /**
   * UI autocapture. Off until `start()`.
   *
   * Separate from `setAutomaticEvents`, which controls lifecycle events the SDK
   * already knows about. This one hooks the view layer — on iOS it swizzles
   * UIKit — which is not something an SDK may do merely because it was
   * initialised.
   */
  readonly autocapture = {
    configure: (options: AutocaptureOptions): Promise<void> =>
      this.call('configureAutocapture', () =>
        NativeIntempt.configureAutocapture(this.instanceName, options)
      ),

    start: (): Promise<void> =>
      this.call('startAutocapture', () =>
        NativeIntempt.startAutocapture(this.instanceName)
      ),

    stop: (): Promise<void> =>
      this.call('stopAutocapture', () =>
        NativeIntempt.stopAutocapture(this.instanceName)
      ),

    isRunning: (): Promise<boolean> =>
      this.call('isAutocaptureRunning', () =>
        NativeIntempt.isAutocaptureRunning(this.instanceName)
      ),
  };

  // MARK: - Push

  /**
   * Registers a push token.
   *
   * On Android this needs Google Play Services. An emulator running the
   * `default` system image has none, so registration cannot succeed there —
   * use a `google_apis` image.
   */
  setPushToken(token: string): Promise<boolean> {
    return this.call('setPushToken', () =>
      NativeIntempt.setPushToken(this.instanceName, token)
    );
  }

  trackPushOpen(payload: Record<string, unknown>): Promise<boolean> {
    return this.call('trackPushOpen', () =>
      NativeIntempt.trackPushOpen(this.instanceName, payload)
    );
  }

  trackPushReceived(payload: Record<string, unknown>): Promise<boolean> {
    return this.call('trackPushReceived', () =>
      NativeIntempt.trackPushReceived(this.instanceName, payload)
    );
  }
}

const instances = new Map<string, IntemptInstance>();

/**
 * Creates or returns a named Intempt instance.
 *
 * Credentials are passed here rather than read from a config file. Android
 * additionally supports `assets/intempt-config.json`, but a file cannot be the
 * only path — React Native cannot ship native assets on a user's behalf.
 *
 * @throws IntemptError with `MissingConfiguration` if any identifier is blank.
 */
export async function init(config: IntemptConfig): Promise<IntemptInstance> {
  requireNonBlank(config.apiKey, 'apiKey');
  requireNonBlank(config.orgId, 'orgId');
  requireNonBlank(config.projectId, 'projectId');
  requireNonBlank(config.sourceId, 'sourceId');

  const instanceName = config.instanceName ?? DEFAULT_INSTANCE;

  const existing = instances.get(instanceName);
  if (existing) {
    // Idempotent, deliberately. But a second init asking for a DIFFERENT geolocation
    // choice used to be discarded here in silence: the native SDKs each warn on exactly
    // this case, and returning before the bridge call made both warnings unreachable
    // from React Native. The contract names this shape -- "initialise again after the
    // consent banner" -- and a JS reload does it on every hot refresh.
    const requested = config.useIpAddressForGeolocation;
    if (requested !== undefined && requested !== existing.useIpAddressForGeolocation) {
      console.warn(
        `[intempt] init("${instanceName}") asked for useIpAddressForGeolocation: ` +
          `${requested}, but that instance already exists with ` +
          `${existing.useIpAddressForGeolocation}. The existing value stands. Pass it on ` +
          `the first init, or use a different instanceName.`,
      );
    }
    return existing;
  }

  try {
    await NativeIntempt.initialize(
      instanceName,
      config.apiKey,
      config.orgId,
      config.projectId,
      config.sourceId,
      // null, not `?? true`. On Android a non-null value OVERRIDES
      // assets/intempt-config.json, so defaulting here silently flipped a customer's
      // "useIpAddressForGeolocation": false back on whenever JS omitted the option --
      // a privacy regression delivered by an SDK upgrade with no code change on their
      // side. android-sdk made the field nullable precisely so null defers to the file.
      config.useIpAddressForGeolocation ?? null
    );
  } catch (error) {
    throw fromNativeRejection(error, 'init');
  }

  const instance = new IntemptInstance(
    instanceName,
    config.useIpAddressForGeolocation,
  );
  instances.set(instanceName, instance);
  return instance;
}

/** The `"default"` instance, if `init()` has created it. */
export function mainInstance(): IntemptInstance | undefined {
  return instances.get(DEFAULT_INSTANCE);
}

/** A named instance, if `init()` has created it. */
export function instance(name: string): IntemptInstance | undefined {
  return instances.get(name);
}

/** Native SDK version — `intempt-swift` or `intempt-android`, not this package. */
export function getSdkVersion(): Promise<string> {
  return NativeIntempt.getSdkVersion();
}

/** Test seam. Drops the JavaScript-side registry; native instances persist. */
export function __resetInstanceRegistryForTests(): void {
  instances.clear();
}

export default { init, mainInstance, instance, getSdkVersion };
