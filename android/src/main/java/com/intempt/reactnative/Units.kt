package com.intempt.reactnative

/**
 * JS documents consent `validUntil` as Unix seconds (src/index.ts); intempt-android's
 * `consent(validUntil)` takes epoch milliseconds.
 */
internal fun consentValidUntilMillis(seconds: Double): Long = (seconds * 1000).toLong()
