package com.intempt.reactnative

/**
 * The allFlags maps whose keys JS has not finished reading, so a JS read can expose its key through
 * the map that served it (intempt-android FlagMap.expose: once per map, and only that map knows the
 * served variation). PLAN §7 item 5, option A.
 *
 * No cap and no eviction, so a read is never silently lost: a map is released once every key JS
 * was given has been exposed, or by [release] when its instance resets, logs out or the module is
 * invalidated. An app that calls allFlags repeatedly and reads only some keys keeps those maps
 * until then; each is a few served values.
 */
internal class FlagHandles {
    private class Handle(val instanceName: String, val pending: MutableSet<String>, val expose: (String) -> Unit)

    private val handles = HashMap<String, Handle>()
    private var issued = 0L

    val size: Int
        @Synchronized get() = handles.size

    /** A token for the map, or null when it has no key JS could read (nothing to keep). */
    @Synchronized
    fun register(
        instanceName: String,
        keys: Set<String>,
        expose: (String) -> Unit,
    ): String? {
        if (keys.isEmpty()) return null
        issued += 1
        val token = issued.toString()
        handles[token] = Handle(instanceName, keys.toMutableSet(), expose)
        return token
    }

    fun expose(
        token: String,
        key: String,
    ) {
        val expose =
            synchronized(this) {
                val handle = handles[token] ?: return
                if (!handle.pending.remove(key)) return
                if (handle.pending.isEmpty()) handles.remove(token)
                handle.expose
            }
        expose(key)
    }

    @Synchronized
    fun release(instanceName: String) {
        handles.values.removeAll { it.instanceName == instanceName }
    }

    @Synchronized
    fun clear() = handles.clear()
}
