/**
 * Types for the Intempt React Native SDK.
 *
 * Mirrors intempt-swift/docs/SDK-API-CONTRACT.md. When the contract changes,
 * this file changes with it — the contract is the source, not this file.
 */

/**
 * A value an attribute or data map may hold.
 *
 * The contract's native type is Swift's `IntemptType`, which accepts String,
 * Int, UInt, Bool, Date, URL, Double, Float, NSNull, NSNumber, Array and
 * Dictionary. `Date` and `URL` have no bridge representation, so they cross as
 * strings and the native side re-types them before enqueueing.
 */
export type IntemptValue =
  | string
  | number
  | boolean
  | null
  | Date
  | IntemptValue[]
  | { [key: string]: IntemptValue };

/** An attribute or data map handed to a capture method. */
export type IntemptProperties = Record<string, IntemptValue>;

/**
 * Credentials and instance selection.
 *
 * Every field but `instanceName` is required and must be non-blank. `apiKey`
 * must be `prefix.secret` — the native side base64s `prefix:secret` into a
 * Basic auth header.
 */
export interface IntemptConfig {
  apiKey: string;
  orgId: string;
  projectId: string;
  sourceId: string;
  /** Defaults to `"default"`. Two instances may not share a name. */
  instanceName?: string;
}

/**
 * Consent decision. An enum rather than a string on purpose: a typo in a
 * stringly-typed consent action is a silent compliance failure.
 */
export enum ConsentAction {
  Accept = 'accept',
  Reject = 'reject',
}

/** Which side of the optimization API a request is asking about. */
export enum OptimizationType {
  Experiment = 'experiment',
  Personalization = 'personalization',
}

/** One product in a `productOrdered` call. */
export interface OrderedProduct {
  productId: string;
  quantity: number;
}

/** An experiment or personalization assignment. */
export interface ExperimentChoice {
  /** Experience id the assignment belongs to. */
  experience: string;
  /** Assigned variant id. This is what a caller branches on. */
  variant: string;
  /** Server-side target the experience was configured against. */
  target?: string;
  /**
   * The experiment or experience name, when the server returns one.
   *
   * Present when the request asked for specific `names`. A `choose-web`
   * response carries ids only, so this is absent there.
   */
  name?: string;
  /** Variant payload the server attached, when present. Untyped by design. */
  payload?: unknown;
}

/**
 * One recommended product.
 *
 * `attributes` holds whatever catalog columns were requested. The named
 * accessors are conveniences over the same map.
 */
export interface ProductRecommendation {
  attributes: Record<string, string>;
  productId?: string;
  title?: string;
  imageUrl?: string;
  url?: string;
  price?: number;
}

/** Arguments to `experiments()`. All optional. */
export interface ExperimentsQuery {
  /** Specific experiment or experience names to evaluate. */
  names?: string[];
  /** Experiment groups — the `byGroups` variant of the same idea. */
  groups?: string[];
  optimizationType?: OptimizationType;
  /** Required by feeds whose input is PRODUCT. */
  productId?: string;
}

/** Arguments to `products()`. */
export interface ProductsQuery {
  feedId: string;
  /** Defaults to 10. */
  count?: number;
  /**
   * Catalog columns to return. Defaults to a compact set on purpose.
   *
   * An unfielded request returns every column including raw ML embedding
   * vectors — measured at 443x the payload for the same 10 products, 503 bytes
   * against 222,919. Widen deliberately, never by omission.
   */
  fields?: string[];
  /**
   * Required by feeds whose input is PRODUCT. Omitting it there returns an
   * empty list rather than an error.
   */
  productId?: string;
}

/** Which lifecycle events the SDK emits without being asked. */
export interface AutomaticEventOptions {
  /** "Session start", carrying device facts as user attributes. On by default. */
  sessions: boolean;
  /** "Application Installed" / "Application Updated", once per version. */
  versionChanges: boolean;
  /** "Application Opened" / "Application Backgrounded" on every transition. */
  appStateChanges: boolean;
}

/**
 * Catalog columns requested from a recommendation feed by default.
 *
 * Kept identical to `Intempt.defaultFeedFields` in the Swift SDK.
 */
export const DEFAULT_FEED_FIELDS: readonly string[] = [
  'productId',
  'title',
  'price',
  'imageUrl',
  'url',
];
