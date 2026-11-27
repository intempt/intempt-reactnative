import XCTest

@testable import IntemptReactNative

// Same cases as android/src/test/.../FlagHandlesTest.kt. Not in jest or CI: runs only through the
// podspec's `Tests` test_spec, like FlagContextIdsTests.
final class FlagHandlesTests: XCTestCase {
    private var exposed: [String] = []

    func testAMapWithNoKeysIsNotKept() {
        let handles = FlagHandles()
        XCTAssertNil(handles.register("default", keys: []) { self.exposed.append($0) })
        XCTAssertEqual(handles.count, 0)
    }

    func testExposingAKeyGoesThroughItsOwnMapOnce() {
        let handles = FlagHandles()
        let token = handles.register("default", keys: ["a", "b"]) { self.exposed.append($0) }!
        handles.expose(token, key: "a")
        handles.expose(token, key: "a")
        XCTAssertEqual(exposed, ["a"])
    }

    func testAKeyTheMapDidNotListIsIgnored() {
        let handles = FlagHandles()
        let token = handles.register("default", keys: ["a"]) { self.exposed.append($0) }!
        handles.expose(token, key: "zz")
        XCTAssertEqual(exposed, [])
        XCTAssertEqual(handles.count, 1)
    }

    func testTheMapIsReleasedOnceEveryKeyIsExposed() {
        let handles = FlagHandles()
        let token = handles.register("default", keys: ["a", "b"]) { self.exposed.append($0) }!
        handles.expose(token, key: "a")
        XCTAssertEqual(handles.count, 1)
        handles.expose(token, key: "b")
        XCTAssertEqual(handles.count, 0)
        handles.expose(token, key: "a")
        XCTAssertEqual(exposed, ["a", "b"])
    }

    func testAnUnknownTokenDoesNothing() {
        FlagHandles().expose("never-issued", key: "a")
        XCTAssertEqual(exposed, [])
    }

    func testReleasingAnInstanceDropsOnlyItsMaps() {
        let handles = FlagHandles()
        let mine = handles.register("default", keys: ["a"]) { self.exposed.append("mine:\($0)") }!
        let other = handles.register("other", keys: ["a"]) { self.exposed.append("other:\($0)") }!
        handles.release("default")
        handles.expose(mine, key: "a")
        handles.expose(other, key: "a")
        XCTAssertEqual(exposed, ["other:a"])
    }
}
