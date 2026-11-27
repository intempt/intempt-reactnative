package com.intempt.reactnative

/** A value read from a registered map; a served `null` is a read, an unserved key is not. */
internal data class FlagRead(val value: Any?)

internal data class FlagMapHandle(val id: String, val keys: List<String>)

/**
 * The maps `allFlags` returned, held native so JS can read one key at a time.
 *
 * intempt-android 8.0.0 records a flag's exposure when its value is read from that map, so copying
 * it into a JS object would expose every served flag on every call. Only `keys` and `containsKey`
 * are used until JS reads a key; those record nothing.
 *
 * Bounded, oldest out: JS holds no finalizer that could release a map, so an unbounded registry
 * would grow with every allFlags call. A key read from an evicted map answers nothing, which JS
 * reports as `undefined`.
 */
internal class FlagMaps(private val capacity: Int = DEFAULT_CAPACITY) {
    private val maps = LinkedHashMap<String, Map<String, Any?>>()
    private var issued = 0L

    @Synchronized
    fun register(map: Map<String, Any?>): FlagMapHandle {
        issued += 1
        val id = issued.toString()
        maps[id] = map
        if (maps.size > capacity) maps.remove(maps.keys.first())
        return FlagMapHandle(id, map.keys.toList())
    }

    @Synchronized
    fun read(id: String, key: String): FlagRead? {
        val map = maps[id] ?: return null
        return if (map.containsKey(key)) FlagRead(map[key]) else null
    }

    private companion object {
        const val DEFAULT_CAPACITY = 128
    }
}
