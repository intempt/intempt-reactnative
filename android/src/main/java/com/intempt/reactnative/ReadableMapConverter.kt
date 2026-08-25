package com.intempt.reactnative

import com.intempt.core.types.FlagContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.intempt.core.types.IntemptValue
import com.intempt.core.types.Product

/**
 * Converts React Native's bridge types into what intempt-android 3.0 accepts.
 *
 * This file used to flatten everything to `Map<String, String>`, because that is
 * all the SDK took before 3.0. The coercion was lossy in the exact way the typed
 * contract exists to prevent: a caller passing `{seats: 3}` shipped `"3"`, and
 * nothing downstream could tell that from a caller who really meant the string.
 *
 * 3.0 takes `Map<String, IntemptValue>`, so the loss is gone. Numbers stay
 * numbers, booleans stay booleans, nested maps and arrays keep their structure
 * instead of being JSON-encoded into a string.
 */
object ReadableMapConverter {

    /**
     * A [FlagContext] from the bridge.
     *
     * Both fields are optional. Omitting profileId lets the native SDK fill in the device
     * identifier it already holds — the one that survives sign-in, and therefore the one that
     * keeps a visitor's assignment stable across it.
     */
    fun toFlagContext(map: ReadableMap?): FlagContext =
        FlagContext(
            userId = map?.takeIf { it.hasKey("userId") }?.getString("userId"),
            profileId = map?.takeIf { it.hasKey("profileId") }?.getString("profileId"),
        )

    /**
     * Converts a bridge map, or null when absent.
     *
     * Null and absent are kept distinct all the way down: the JavaScript layer
     * already drops `undefined` keys and forwards explicit nulls, because an
     * explicit null clears an attribute while an absent key must not mention it.
     */
    fun toValueMap(map: ReadableMap?): Map<String, IntemptValue>? {
        if (map == null) return null

        val out = mutableMapOf<String, IntemptValue>()
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            out[key] = valueOf(map, key)
        }
        return out
    }

    private fun valueOf(map: ReadableMap, key: String): IntemptValue =
        when (map.getType(key)) {
            ReadableType.Null -> IntemptValue.Null
            ReadableType.Boolean -> IntemptValue.Bool(map.getBoolean(key))
            // The bridge carries every JavaScript number as a double. IntemptValue.Num
            // narrows integral doubles back to Long when it serializes, so 3 does not
            // reach the wire as 3.0.
            ReadableType.Number -> IntemptValue.Num(map.getDouble(key))
            ReadableType.String -> IntemptValue.Str(map.getString(key).orEmpty())
            ReadableType.Map -> IntemptValue.Obj(toValueMap(map.getMap(key)).orEmpty())
            ReadableType.Array -> IntemptValue.Arr(toValueList(map.getArray(key)))
        }

    private fun toValueList(array: ReadableArray?): List<IntemptValue> {
        if (array == null) return emptyList()
        return (0 until array.size()).map { index ->
            when (array.getType(index)) {
                ReadableType.Null -> IntemptValue.Null
                ReadableType.Boolean -> IntemptValue.Bool(array.getBoolean(index))
                ReadableType.Number -> IntemptValue.Num(array.getDouble(index))
                ReadableType.String -> IntemptValue.Str(array.getString(index).orEmpty())
                ReadableType.Map -> IntemptValue.Obj(toValueMap(array.getMap(index)).orEmpty())
                ReadableType.Array -> IntemptValue.Arr(toValueList(array.getArray(index)))
            }
        }
    }

    /**
     * Parses `productOrdered` entries.
     *
     * A malformed entry throws rather than being skipped. A dropped line item in
     * an order is a revenue number that is quietly wrong, which is worse than a
     * loud failure.
     */
    fun toOrderedProducts(products: ReadableArray): List<Product> =
        (0 until products.size()).map { index ->
            val entry = products.getMap(index)
                ?: throw IllegalArgumentException("productOrdered entry $index is not an object")

            val productId = entry.takeIf { it.hasKey("productId") }?.getString("productId")
                ?: throw IllegalArgumentException("productOrdered entry $index lacks productId")

            if (!entry.hasKey("quantity") || entry.getType("quantity") != ReadableType.Number) {
                throw IllegalArgumentException(
                    "productOrdered entry $index lacks a numeric quantity",
                )
            }

            Product(productId, entry.getDouble("quantity").toInt())
        }

    fun toStringList(array: ReadableArray?): List<String>? {
        if (array == null) return null
        return (0 until array.size()).mapNotNull { array.getString(it) }
    }
}
