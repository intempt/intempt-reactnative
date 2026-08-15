package com.intempt.reactnative

import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType

/**
 * Converts React Native's bridge types into what intempt-android accepts.
 *
 * intempt-android takes `Map<String, String>` until 3.0, so numbers and
 * booleans have to be rendered as text on the way in. That coercion is LOSSY
 * and is the single clearest argument for the contract's typed values: a caller
 * passing `{seats: 3}` cannot currently be distinguished downstream from one
 * passing `{seats: "3"}`.
 *
 * The coercion is deliberately explicit and centralised here so that when 3.0
 * lands, one file changes and the loss stops.
 */
object ReadableMapConverter {

    /**
     * Flattens a bridge map to `Map<String, String>`.
     *
     * Numbers render without a trailing `.0` when integral, because `3.0` is a
     * surprising value to find in an analytics property that was written as 3.
     * Nested maps and arrays are JSON-encoded rather than dropped — a truncated
     * property is harder to debug than an escaped one.
     */
    fun toStringMap(map: ReadableMap?): Map<String, String>? {
        if (map == null) return null

        val out = mutableMapOf<String, String>()
        val iterator = map.keySetIterator()
        while (iterator.hasNextKey()) {
            val key = iterator.nextKey()
            when (map.getType(key)) {
                ReadableType.Null -> out[key] = ""
                ReadableType.Boolean -> out[key] = map.getBoolean(key).toString()
                ReadableType.Number -> out[key] = formatNumber(map.getDouble(key))
                ReadableType.String -> out[key] = map.getString(key).orEmpty()
                ReadableType.Map -> out[key] = jsonOf(map.getMap(key))
                ReadableType.Array -> out[key] = jsonOf(map.getArray(key))
            }
        }
        return out
    }

    /**
     * Parses `productOrdered` entries.
     *
     * A malformed entry throws rather than being skipped. A dropped line item
     * in an order is a revenue number that is quietly wrong, which is worse
     * than a loud failure.
     */
    fun toOrderedProducts(products: ReadableArray): List<Map<String, Any>> =
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

            mapOf("productId" to productId, "quantity" to entry.getDouble("quantity").toInt())
        }

    fun toStringList(array: ReadableArray?): List<String>? {
        if (array == null) return null
        return (0 until array.size()).mapNotNull { array.getString(it) }
    }

    private fun formatNumber(value: Double): String =
        if (value == value.toLong().toDouble()) value.toLong().toString() else value.toString()

    private fun jsonOf(map: ReadableMap?): String =
        map?.toHashMap()?.let { org.json.JSONObject(it).toString() } ?: "null"

    private fun jsonOf(array: ReadableArray?): String =
        array?.toArrayList()?.let { org.json.JSONArray(it).toString() } ?: "null"
}
