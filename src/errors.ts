/**
 * Error surface for the Intempt React Native SDK.
 *
 * Mirrors the contract's error cases. Native rejections carry a `code` that
 * maps to `IntemptErrorCode`; anything unrecognised becomes `unknown` rather
 * than being swallowed.
 */

/**
 * Error codes a native module may reject with.
 *
 * The first nine mirror `IntemptError` in the Swift SDK. The last three are
 * introduced by the bridge and have no native equivalent.
 */
export enum IntemptErrorCode {
  /** API key is not `prefix.secret`. */
  MalformedApiKey = 'malformed_api_key',
  /** A required identifier was blank. */
  MissingConfiguration = 'missing_configuration',
  /** A property value could not be represented. */
  InvalidPropertyValue = 'invalid_property_value',
  /** A required identifier was absent for the event type. */
  MissingIdentity = 'missing_identity',
  /** Payload would not serialize. */
  EncodingFailed = 'encoding_failed',
  /** Will never succeed on retry. */
  Terminal = 'terminal',
  /** Retry with backoff. */
  Retryable = 'retryable',
  /** Network layer failed. */
  Transport = 'transport',
  /** The queue could not persist. */
  StorageUnavailable = 'storage_unavailable',
  /** Server rejected with detail. */
  Server = 'server',

  /** Method exists in the contract but not yet on Android. */
  UnsupportedOnAndroid = 'unsupported_on_android',
  /** Method exists in the contract but not yet on iOS. */
  UnsupportedOnIos = 'unsupported_on_ios',
  /** The native module does not exist on this platform (web, desktop). */
  UnsupportedPlatform = 'unsupported_platform',
  /** A method was called before `init()`. */
  NotInitialized = 'not_initialized',
  /** Native rejected with a code this version does not recognise. */
  Unknown = 'unknown',
}

const KNOWN_CODES = new Set<string>(Object.values(IntemptErrorCode));

/**
 * An error raised by the Intempt SDK.
 *
 * Carries the native code so callers can branch on it. `retryAfter` is present
 * only on `Retryable`, and `status` only on the HTTP-derived cases.
 */
export class IntemptError extends Error {
  readonly code: IntemptErrorCode;
  /** HTTP status, when the error came from a response. */
  readonly status?: number;
  /** Seconds to wait, when the server sent Retry-After. */
  readonly retryAfter?: number;
  /** The method that failed, when the bridge knows it. */
  readonly method?: string;

  constructor(
    code: IntemptErrorCode,
    message: string,
    detail: { status?: number; retryAfter?: number; method?: string } = {}
  ) {
    super(message);
    this.name = 'IntemptError';
    this.code = code;
    this.status = detail.status;
    this.retryAfter = detail.retryAfter;
    this.method = detail.method;

    // Required for `instanceof` to survive transpilation to ES5.
    Object.setPrototypeOf(this, IntemptError.prototype);
  }

  /**
   * True when retrying the same call could plausibly succeed.
   *
   * Deliberately narrow. A 401 is terminal — a bad credential cannot succeed
   * on retry — even though the queued events are kept, because the data is
   * valid and the integration is what is broken.
   */
  get isRetryable(): boolean {
    return (
      this.code === IntemptErrorCode.Retryable ||
      this.code === IntemptErrorCode.Transport
    );
  }

  /** True when the method is missing on this platform rather than broken. */
  get isUnsupported(): boolean {
    return (
      this.code === IntemptErrorCode.UnsupportedOnAndroid ||
      this.code === IntemptErrorCode.UnsupportedOnIos ||
      this.code === IntemptErrorCode.UnsupportedPlatform
    );
  }
}

/**
 * Converts a rejection from the native module into an `IntemptError`.
 *
 * React Native rejections arrive as objects with `code`, `message` and
 * `userInfo`. An unrecognised code becomes `Unknown` with the original text
 * preserved — never silently remapped onto a code that means something else.
 */
export function fromNativeRejection(error: unknown, method: string): IntemptError {
  if (error instanceof IntemptError) {
    return error;
  }

  const raw = error as {
    code?: string;
    message?: string;
    userInfo?: { status?: number; retryAfter?: number };
  } | null;

  const rawCode = raw?.code;
  const code =
    rawCode && KNOWN_CODES.has(rawCode)
      ? (rawCode as IntemptErrorCode)
      : IntemptErrorCode.Unknown;

  const message = raw?.message ?? `Intempt.${method} failed`;

  return new IntemptError(code, message, {
    status: raw?.userInfo?.status,
    retryAfter: raw?.userInfo?.retryAfter,
    method,
  });
}
