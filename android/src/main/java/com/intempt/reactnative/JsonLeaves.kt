package com.intempt.reactnative

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.long
import kotlinx.serialization.json.longOrNull

/**
 * A kotlinx JSON leaf as the Kotlin value it stands for.
 *
 * JsonObject implements Map and JsonArray implements List, so both already recurse through
 * IntemptReactNativeModule.putValue. A JsonPrimitive matches none of its branches and used to fall to
 * `putString(value.toString())`, which keeps JSON's quoting: `"#000"` crossed the bridge as
 * the six-character string `"#000"`, `1` as `"1"`. iOS returns real values, and the two
 * platforms must not disagree about the same payload.
 */
internal fun unwrapJson(value: Any?): Any? =
    when (value) {
        is JsonNull -> null
        is JsonPrimitive ->
            when {
                value.isString -> value.content
                value.booleanOrNull != null -> value.boolean
                value.longOrNull != null -> value.long
                value.doubleOrNull != null -> value.double
                else -> value.content
            }
        else -> value
    }
