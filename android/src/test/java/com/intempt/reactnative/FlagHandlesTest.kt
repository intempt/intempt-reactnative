package com.intempt.reactnative

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The allFlags maps the bridge keeps so a JS read can expose its key through the map that served
// it (PLAN §7 item 5, option A). No cap: a map is released once every key JS was given has been
// exposed, or when its instance resets, logs out or the module goes away.
class FlagHandlesTest {
    private val exposed = mutableListOf<String>()

    @Test
    fun aMapWithNoKeysIsNotKept() {
        val handles = FlagHandles()
        assertNull(handles.register("default", emptySet()) { exposed += it })
        assertEquals(0, handles.size)
    }

    @Test
    fun exposingAKeyGoesThroughItsOwnMapOnce() {
        val handles = FlagHandles()
        val token = handles.register("default", setOf("a", "b")) { exposed += it }!!
        handles.expose(token, "a")
        handles.expose(token, "a")
        assertEquals(listOf("a"), exposed)
    }

    @Test
    fun aKeyTheMapDidNotListIsIgnored() {
        val handles = FlagHandles()
        val token = handles.register("default", setOf("a")) { exposed += it }!!
        handles.expose(token, "zz")
        assertEquals(emptyList<String>(), exposed)
        assertEquals(1, handles.size)
    }

    @Test
    fun theMapIsReleasedOnceEveryKeyIsExposed() {
        val handles = FlagHandles()
        val token = handles.register("default", setOf("a", "b")) { exposed += it }!!
        handles.expose(token, "a")
        assertEquals(1, handles.size)
        handles.expose(token, "b")
        assertEquals(0, handles.size)
        handles.expose(token, "a")
        assertEquals(listOf("a", "b"), exposed)
    }

    @Test
    fun anUnknownTokenDoesNothing() {
        FlagHandles().expose("never-issued", "a")
        assertEquals(emptyList<String>(), exposed)
    }

    @Test
    fun releasingAnInstanceDropsOnlyItsMaps() {
        val handles = FlagHandles()
        val mine = handles.register("default", setOf("a")) { exposed += "mine:$it" }!!
        val other = handles.register("other", setOf("a")) { exposed += "other:$it" }!!
        handles.release("default")
        handles.expose(mine, "a")
        handles.expose(other, "a")
        assertEquals(listOf("other:a"), exposed)
    }

    @Test
    fun eachRegistrationGetsItsOwnToken() {
        val handles = FlagHandles()
        val first = handles.register("default", setOf("a")) { exposed += "1" }!!
        val second = handles.register("default", setOf("a")) { exposed += "2" }!!
        handles.expose(second, "a")
        handles.expose(first, "a")
        assertEquals(listOf("2", "1"), exposed)
    }
}
