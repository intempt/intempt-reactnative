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

import NativeIntempt from './NativeIntempt';
import { IntemptError, IntemptErrorCode, fromNativeRejection } from './errors';
import {
  ConsentAction,
  DEFAULT_FEED_FIELDS,
  OptimizationType,
} from './types';
import type {
  AutomaticEventOptions,
  ExperimentChoice,
  ExperimentsQuery,
  IntemptConfig,
  IntemptProperties,
  IntemptValue,
  OrderedProduct,
  ProductRecommendation,
  ProductsQuery,
} from './types';

export {
  ConsentAction,
  OptimizationType,
  DEFAULT_FEED_FIELDS,
  IntemptError,
  IntemptErrorCode,
};
export type {
  AutomaticEventOptions,
  ExperimentChoice,
  ExperimentsQuery,
  IntemptConfig,
  IntemptProperties,
  IntemptValue,
  OrderedProduct,
  ProductRecommendation,
  ProductsQuery,
};

const DEFAULT_INSTANCE = 'default';

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
  if (value !== null && typeof value === 'object') {
    return encodeProperties(value as IntemptProperties);
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
 * One configured Intempt instance.
 *
 * Obtained from `Intempt.init()`. Multiple named instances coexist; each has
 * its own credentials, queue and identity.
 */
export class IntemptInstance {
  /** @internal */
  constructor(private readonly instanceName: string) {}

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
        options.eventTitle ?? 'Identify',
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
        options.eventTitle ?? 'Identify',
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
  async isUserOptIn(): Promise<boolean> {
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

  // MARK: - Personalization

  /** Evaluates experiments or personalizations for the current profile. */
  experiments(query: ExperimentsQuery = {}): Promise<ExperimentChoice[]> {
    return this.call('experiments', () =>
      NativeIntempt.experiments(
        this.instanceName,
        query.names ?? null,
        query.groups ?? null,
        query.optimizationType ?? null,
        query.productId ?? null
      )
    ) as Promise<ExperimentChoice[]>;
  }

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
    return existing;
  }

  try {
    await NativeIntempt.initialize(
      instanceName,
      config.apiKey,
      config.orgId,
      config.projectId,
      config.sourceId
    );
  } catch (error) {
    throw fromNativeRejection(error, 'init');
  }

  const instance = new IntemptInstance(instanceName);
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
