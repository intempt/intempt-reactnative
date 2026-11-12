package com.intempt.reactnative

import org.junit.Assert.assertEquals
import org.junit.Test

// INT-7449: rn-34 sent validUntil 1825863654 where android-34 sends 1825860137812.
class ConsentUnitsTest {
    private val now = 1_762_000_000_000L

    @Test
    fun secondsFromJsBecomeEpochMillisForTheSdk() {
        assertEquals(1825863654000L, consentValidUntilMillis(1825863654.0, now))
    }

    @Test
    fun fractionalSecondsKeepTheirMilliseconds() {
        assertEquals(1825863654250L, consentValidUntilMillis(1825863654.25, now))
    }

    // Ro-bot impact:F3: NaN and Infinity reached the SDK as 0 and Long.MAX_VALUE.
    @Test
    fun nanExpiresNowAsOnIos() {
        assertEquals(now, consentValidUntilMillis(Double.NaN, now))
    }

    @Test
    fun infinityIsUnlimitedAsOnIos() {
        assertEquals(CONSENT_UNLIMITED, consentValidUntilMillis(Double.POSITIVE_INFINITY, now))
    }

    @Test
    fun aPastTimeOrNegativeInfinityExpiresNow() {
        assertEquals(now, consentValidUntilMillis(0.0, now))
        assertEquals(now, consentValidUntilMillis(Double.NEGATIVE_INFINITY, now))
        assertEquals(now, consentValidUntilMillis(now / 1000.0 - 1, now))
    }
}
