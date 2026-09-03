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
  /**
   * Whether Intempt may derive country, region and city from the address the request already
   * arrives on. Defaults to `true`, matching mixpanel-swift's `useIPAddressForGeolocation` and
   * android-sdk's `useIpAddressForGeolocation`.
   *
   * The SDK never reads or sends the device's address itself. It sends `?ip=1` or `?ip=0` and the
   * platform resolves the connection address against a local database, then discards it before
   * storing anything. No third party is involved.
   *
   * Leaving it on means your app collects **Coarse Location**: the derived country/region/city is
   * stored, and Apple counts anything derived from data sent off device separately from that data.
   * Declare it in your App Store privacy label, or set this to `false`.
   *
   * Honoured on both platforms. It reaches the native SDK directly and overrides
   * `assets/intempt-config.json` on Android, so an RN app never has to edit the native bundle.
   */
  useIpAddressForGeolocation?: boolean;
}

/**
 * Consent decision. An enum rather than a string on purpose: a typo in a
 * stringly-typed consent action is a silent compliance failure.
 */
export enum ConsentAction {
  Accept = 'accept',
  Reject = 'reject',
}

/** One product in a `productOrdered` call. */
export interface OrderedProduct {
  productId: string;
  quantity: number;
}

/**
 * Who is being evaluated.
 *
 * `profileId` is the device identifier the native SDK already holds; supplying nothing lets it
 * fill that in. It is present before and after a person signs in, which is what keeps their
 * assignment stable across the transition — deriving on the user id re-buckets them mid-session
 * (EXP-ASSIGN-005).
 */
export interface FlagContext {
  userId?: string;
  profileId?: string;
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
 * Which UI interactions the SDK captures without an explicit call.
 *
 * Distinct from {@link AutomaticEventOptions}, and repeatedly confused with it.
 * Automatic events are lifecycle facts the SDK already knows. Autocapture hooks
 * the view layer — on iOS it swizzles UIKit — so it installs nothing until
 * `start()` is called.
 *
 * The contract exposes the two concepts both platforms have. Finer native
 * options stay platform-specific: iOS separates `taps` from `rawTouches`
 * because a button press already emits its own event, and counting it again as
 * a generic touch would double-count every button in the app.
 */
export interface AutocaptureOptions {
  /** Screen appearances and exits. */
  screenViews: boolean;
  /** Presses and value changes on native controls. */
  controlInteractions: boolean;
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
