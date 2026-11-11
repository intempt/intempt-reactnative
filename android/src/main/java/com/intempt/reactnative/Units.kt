package com.intempt.reactnative

/** push-source's "unlimited" consent; intempt-swift sends the same for an infinite duration. */
internal const val CONSENT_UNLIMITED = -1L

/**
 * JS documents consent `validUntil` as Unix seconds (src/index.ts); intempt-android's
 * `consent(validUntil)` takes epoch milliseconds.
 *
 * Matches the iOS bridge's clamp (`consentDuration`): a past time, NaN or -Infinity becomes
 * "expires now", and +Infinity becomes unlimited. A raw `(NaN * 1000).toLong()` is 0 and
 * `Infinity` is Long.MAX_VALUE, both answered 400 by push-source (epochs 2010–2040 only).
 */
internal fun consentValidUntilMillis(seconds: Double, nowMillis: Long = System.currentTimeMillis()): Long =
    when {
        seconds == Double.POSITIVE_INFINITY -> CONSENT_UNLIMITED
        seconds.isNaN() -> nowMillis
        else -> maxOf((seconds * 1000).toLong(), nowMillis)
    }
