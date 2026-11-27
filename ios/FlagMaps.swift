import Foundation

/// The maps `allFlags` returned, held native so JS can read one key at a time.
///
/// intempt-swift 0.7.0's `FlagValues` records a flag's exposure when its value is read, so copying
/// it into a JS object would expose every served flag on every call. Generic so ios/Tests can
/// cover it without an IntemptInstance; the bridge stores `FlagValues`.
///
/// Bounded, oldest out: JS holds no finalizer that could release a map, so an unbounded registry
/// would grow with every allFlags call. A key read from an evicted map answers nothing, which JS
/// reports as `undefined`. Same capacity and ids as android/.../FlagMaps.kt.
final class FlagMaps<Map> {
    private let capacity: Int
    private let lock = NSLock()
    private var maps: [String: Map] = [:]
    private var order: [String] = []
    private var issued = 0

    init(capacity: Int = 128) {
        self.capacity = capacity
    }

    func register(_ map: Map) -> String {
        lock.lock()
        defer { lock.unlock() }
        issued += 1
        let id = String(issued)
        maps[id] = map
        order.append(id)
        if order.count > capacity {
            maps.removeValue(forKey: order.removeFirst())
        }
        return id
    }

    func map(_ id: String) -> Map? {
        lock.lock()
        defer { lock.unlock() }
        return maps[id]
    }
}
