package com.intempt.reactnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// intempt-android 8.0.0's allFlags map records an exposure when a value is read (get, values,
// entries). The bridge must hand JS the keys and read a value only when JS reads that key, or
// every served flag is exposed on every allFlags call.
class FlagMapsTest {
    /** Counts value reads the way intempt-android's ExposingFlagMap reports them. */
    private class RecordingMap(private val backing: Map<String, Any?>) : Map<String, Any?> by backing {
        val valueReads = mutableListOf<String>()

        override fun get(key: String): Any? {
            valueReads += key
            return backing[key]
        }

        override val values: Collection<Any?>
            get() {
                valueReads += backing.keys
                return backing.values
            }

        override val entries: Set<Map.Entry<String, Any?>>
            get() {
                valueReads += backing.keys
                return backing.entries
            }
    }

    private val served = mapOf("checkout_v2" to true, "banner" to "blue", "retired" to null)

    @Test
    fun registeringListsTheKeysAndReadsNoValue() {
        val map = RecordingMap(served)
        val handle = FlagMaps().register(map)
        assertEquals(listOf("checkout_v2", "banner", "retired"), handle.keys)
        assertEquals(emptyList<String>(), map.valueReads)
    }

    @Test
    fun readingAKeyReadsThatValueOnly() {
        val map = RecordingMap(served)
        val maps = FlagMaps()
        val id = maps.register(map).id
        assertEquals(FlagRead("blue"), maps.read(id, "banner"))
        assertEquals(listOf("banner"), map.valueReads)
    }

    @Test
    fun aServedNullIsARead() {
        val maps = FlagMaps()
        val id = maps.register(RecordingMap(served)).id
        assertEquals(FlagRead(null), maps.read(id, "retired"))
    }

    @Test
    fun anUnservedKeyIsNotReadFromTheMap() {
        val map = RecordingMap(served)
        val maps = FlagMaps()
        val id = maps.register(map).id
        assertNull(maps.read(id, "absent"))
        assertEquals(emptyList<String>(), map.valueReads)
    }

    @Test
    fun anUnknownHandleAnswersNothing() {
        assertNull(FlagMaps().read("never-issued", "banner"))
    }

    @Test
    fun eachRegistrationGetsItsOwnHandle() {
        val maps = FlagMaps()
        val first = maps.register(mapOf("a" to 1)).id
        val second = maps.register(mapOf("a" to 2)).id
        assertEquals(FlagRead(1), maps.read(first, "a"))
        assertEquals(FlagRead(2), maps.read(second, "a"))
    }

    @Test
    fun theOldestMapIsDroppedPastCapacity() {
        val maps = FlagMaps(capacity = 2)
        val oldest = maps.register(mapOf("a" to 1)).id
        val middle = maps.register(mapOf("a" to 2)).id
        val newest = maps.register(mapOf("a" to 3)).id
        assertNull(maps.read(oldest, "a"))
        assertEquals(FlagRead(2), maps.read(middle, "a"))
        assertEquals(FlagRead(3), maps.read(newest, "a"))
    }
}
