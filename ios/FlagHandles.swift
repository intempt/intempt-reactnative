import Foundation

/// The allFlags maps whose keys JS has not finished reading, so a JS read can expose its key
/// through the map that served it (intempt-swift `FlagValues.expose`: once per map, and only that
/// map knows the served variation). PLAN §7 item 5, option A. Same rules as
/// android/.../FlagHandles.kt.
///
/// No cap and no eviction, so a read is never silently lost: a map is released once every key JS
/// was given has been exposed, or by `release` when its instance resets or logs out. Held per
/// module instance, so a bridge reload drops them with the module.
final class FlagHandles {
    private struct Handle {
        let instanceName: String
        var pending: Set<String>
        let expose: (String) -> Void
    }

    private let lock = NSLock()
    private var handles: [String: Handle] = [:]
    private var issued = 0

    var count: Int {
        lock.lock()
        defer { lock.unlock() }
        return handles.count
    }

    /// A token for the map, or nil when it has no key JS could read (nothing to keep).
    func register(_ instanceName: String, keys: Set<String>, expose: @escaping (String) -> Void)
        -> String?
    {
        guard !keys.isEmpty else { return nil }
        lock.lock()
        defer { lock.unlock() }
        issued += 1
        let token = String(issued)
        handles[token] = Handle(instanceName: instanceName, pending: keys, expose: expose)
        return token
    }

    func expose(_ token: String, key: String) {
        lock.lock()
        guard var handle = handles[token], handle.pending.remove(key) != nil else {
            lock.unlock()
            return
        }
        handles[token] = handle.pending.isEmpty ? nil : handle
        lock.unlock()
        handle.expose(key)
    }

    func release(_ instanceName: String) {
        lock.lock()
        defer { lock.unlock() }
        handles = handles.filter { $0.value.instanceName != instanceName }
    }
}
