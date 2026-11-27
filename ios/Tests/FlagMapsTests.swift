import XCTest

@testable import IntemptReactNative

// The registry behind allFlags/flagValue. Not in jest or CI: runs only through the podspec's
// `Tests` test_spec, like FlagContextIdsTests.
final class FlagMapsTests: XCTestCase {
    func testEachRegistrationGetsItsOwnHandle() {
        let maps = FlagMaps<[String: Int]>()
        let first = maps.register(["a": 1])
        let second = maps.register(["a": 2])
        XCTAssertNotEqual(first, second)
        XCTAssertEqual(maps.map(first)?["a"], 1)
        XCTAssertEqual(maps.map(second)?["a"], 2)
    }

    func testAnUnknownHandleAnswersNothing() {
        XCTAssertNil(FlagMaps<[String: Int]>().map("never-issued"))
    }

    func testTheOldestMapIsDroppedPastCapacity() {
        let maps = FlagMaps<[String: Int]>(capacity: 2)
        let oldest = maps.register(["a": 1])
        let middle = maps.register(["a": 2])
        let newest = maps.register(["a": 3])
        XCTAssertNil(maps.map(oldest))
        XCTAssertEqual(maps.map(middle)?["a"], 2)
        XCTAssertEqual(maps.map(newest)?["a"], 3)
    }
}
