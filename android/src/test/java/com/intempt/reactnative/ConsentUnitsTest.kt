package com.intempt.reactnative

import org.junit.Assert.assertEquals
import org.junit.Test

// INT-7449: rn-34 sent validUntil 1825863654 where android-34 sends 1825860137812.
class ConsentUnitsTest {
    @Test
    fun secondsFromJsBecomeEpochMillisForTheSdk() {
        assertEquals(1825863654000L, consentValidUntilMillis(1825863654.0))
    }

    @Test
    fun fractionalSecondsKeepTheirMilliseconds() {
        assertEquals(1825863654250L, consentValidUntilMillis(1825863654.25))
    }
}
