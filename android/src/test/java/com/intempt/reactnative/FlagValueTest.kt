package com.intempt.reactnative

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// INT-7450: intempt-android unwraps only a top-level primitive, so the leaves of an object or
// array flag reach the bridge as JsonPrimitive, and toString() kept the JSON quoting
// (rn-34 flags_choose: "color": "\"blue\"").
class FlagValueTest {
    @Test
    fun aStringLeafLosesItsJsonQuotes() {
        assertEquals("blue", unwrapJson(JsonPrimitive("blue")))
    }

    @Test
    fun aQuotedStringThatLooksBooleanStaysAString() {
        assertEquals("true", unwrapJson(JsonPrimitive("true")))
    }

    @Test
    fun anIntegerLeafBecomesALong() {
        assertEquals(3L, unwrapJson(JsonPrimitive(3)))
    }

    @Test
    fun aFractionalLeafBecomesADouble() {
        assertEquals(1.5, unwrapJson(JsonPrimitive(1.5)))
    }

    @Test
    fun aBooleanLeafBecomesABoolean() {
        assertEquals(true, unwrapJson(JsonPrimitive(true)))
    }

    @Test
    fun aJsonNullLeafBecomesNull() {
        assertNull(unwrapJson(JsonNull))
    }

    @Test
    fun aPlainKotlinValuePassesThrough() {
        assertEquals("x", unwrapJson("x"))
    }
}
