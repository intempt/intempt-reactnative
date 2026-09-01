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
  FlagContext,
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
  FlagContext,
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

/**
 * A flag key the serving endpoint can actually match.
 *
 * `CONVENTIONS.md`: a validation mistake throws, a service problem does not. This is the
 * validation half, and without it the promise was not kept — `variation()` passed anything
 * straight to the bridge.
 *
 * The character class is the server's own: `ExperienceApiChooseRequest.names` is
 * `Set<@Pattern(regexp = "^[a-zA-Z0-9_-]*$") String>`. Two ways that quantifier lets a caller
 * error reach production silently, both closed here:
 *
 *  - `*` ACCEPTS THE EMPTY STRING, so a blank key is a valid request that matches no experience.
 *  - A key with a dot or a space is a 400, which the SDK absorbs like any other service failure —
 *    so a typo returns the caller's default and looks exactly like a flag that is off.
 *
 * Both are programming errors the caller can fix, so they fail loudly at the call site.
 */
function requireFlagKey(key: string, method: string): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new IntemptError(
      IntemptErrorCode.MissingConfiguration,
      'key must be a non-empty string',
      { method }
    );
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
    throw new IntemptError(
      IntemptErrorCode.MissingConfiguration,
      `key must match /^[a-zA-Z0-9_-]+$/ — received ${JSON.stringify(key)}`,
      { method }
    );
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
        // Same reservation as identify(); the default here was also the wrong
        // word — a group event is named "Group", not "Identify".
        options.eventTitle ?? null,
        encodeProperties(options.accountAttributes)
      )
    );
  }

  /** Merges two user identities. */
  alias(userId: string, anotherUserId: string): Promise<boolean> {
    return this.call('alias', () =>
      NativeIntempt.alias(this.instanceName, userId, anotherUserId)
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
   * The value assigned for `key`, or `defaultValue` when the service did not answer.
   *
   * Ask for a KEY, never a mode. Whether the key names an experiment, a personalization or a flag
   * is the platform's business: its serving query filters on channel and status and never on mode.
   */
  async variation<T>(key: string, context: FlagContext, defaultValue: T): Promise<T> {
    requireFlagKey(key, 'variation');
    if (defaultValue === undefined) {
      // A default of `undefined` is indistinguishable from omitting one: the absent-value branch
      // below returns it either way, so the caller cannot tell a served value from a failure.
      // CONVENTIONS.md calls the default REQUIRED; this is where that is true.
      throw new IntemptError(
        IntemptErrorCode.MissingConfiguration,
        'defaultValue is required — it is what a caller receives when the service does not answer',
        { method: 'variation' }
      );
    }

    const raw = (await this.call('variation', () =>
      NativeIntempt.variation(
        this.instanceName,
        key,
        context as object,
        // The default is sent for shape only; the native side never reads it. This layer holds
        // the real one and applies it below, so a service failure cannot reject into a render.
        {}
      )
    )) as { value?: T };

    return raw?.value === undefined ? defaultValue : raw.value;
  }

  /** Every key assigned to this person, in one call. */
  async allFlags(context: FlagContext): Promise<Record<string, unknown>> {
    return (await this.call('allFlags', () =>
      NativeIntempt.allFlags(this.instanceName, context as object)
    )) as Record<string, unknown>;
  }

  async boolVariation(key: string, context: FlagContext, defaultValue: boolean): Promise<boolean> {
    const value = await this.variation<unknown>(key, context, defaultValue);
    // A served value of the wrong type is a misconfiguration, not something to coerce:
    // Boolean('false') is true, and a silent coercion is indistinguishable from a real answer.
    return typeof value === 'boolean' ? value : defaultValue;
  }

  async stringVariation(key: string, context: FlagContext, defaultValue: string): Promise<string> {
    const value = await this.variation<unknown>(key, context, defaultValue);
    return typeof value === 'string' ? value : defaultValue;
  }

  async numberVariation(key: string, context: FlagContext, defaultValue: number): Promise<number> {
    const value = await this.variation<unknown>(key, context, defaultValue);
    // EQUIVALENT MUTANT on the typeof operand. Number.isFinite does not coerce — unlike the
    // global isFinite — so it returns true only for values already of type number, and the
    // operand cannot change the outcome. It is not removable: Number.isFinite carries no type
    // predicate, so without it tsc reports "Type 'unknown' is not assignable to type 'number'".
    // Stryker disable next-line ConditionalExpression: equivalent, see the note above
    return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
  }

  /**
   * Resolves immediately.
   *
   * Present so the cross-SDK surface is the same everywhere, and so a caller porting from an SDK
   * that polls a local flag store does not have to remove the call. Evaluation is remote on both
   * native platforms: each `variation` is a request, so there is no local state to wait for.
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
