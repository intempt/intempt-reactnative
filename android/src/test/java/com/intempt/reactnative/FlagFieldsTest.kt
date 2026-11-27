package com.intempt.reactnative

import com.intempt.core.types.FlagDetail
import com.intempt.core.types.FlagErrorCode
import com.intempt.core.types.FlagReason
import org.junit.Assert.assertEquals
import org.junit.Test

// The JS FlagDetail shape (src/types.ts) must match iOS's TypeBridge.dictionary(from: FlagDetail).
class FlagFieldsTest {
    @Test
    fun aServedAnswerCarriesItsWireReasonAndVariation() {
        val detail = FlagDetail("blue", FlagReason.NOT_IN_ROLLOUT, null, null, 41L, "string", 2, "b")
        assertEquals(
            mapOf(
                "value" to "blue",
                "reason" to "not_in_rollout",
                "variationId" to 41L,
                "valueType" to "string",
                "rule" to 2,
                "variant" to "b",
            ),
            flagDetailFields(detail),
        )
    }

    @Test
    fun aFailedReadCarriesTheErrorCodeByName() {
        // FlagError's constructor is internal to intempt-android, so the `error` field is covered
        // by the JS tests only.
        val detail = FlagDetail("red", FlagReason.ERROR, null, FlagErrorCode.TYPE_MISMATCH)
        assertEquals(
            mapOf("value" to "red", "reason" to "error", "errorCode" to "TYPE_MISMATCH"),
            flagDetailFields(detail),
        )
    }

    @Test
    fun aServedNullStaysANullValue() {
        assertEquals(mapOf("value" to null, "reason" to "off"), flagDetailFields(FlagDetail(null, FlagReason.OFF)))
    }
}
