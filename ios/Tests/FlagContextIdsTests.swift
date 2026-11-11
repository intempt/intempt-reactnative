import XCTest

@testable import IntemptReactNative

// INT-7453. Not in jest or CI: runs only through the podspec's `Tests` test_spec (see the podspec).
final class FlagContextIdsTests: XCTestCase {
    func testMissingProfileIdUsesStoredId() {
        let ids = IntemptReactNative.flagContextIds(
            from: ["userId": "u-1"], storedProfileId: "stored-p")
        XCTAssertEqual(ids.profileId, "stored-p")
        XCTAssertEqual(ids.userId, "u-1")
    }

    func testEmptyProfileIdUsesStoredId() {
        let ids = IntemptReactNative.flagContextIds(
            from: ["userId": "u-1", "profileId": ""], storedProfileId: "stored-p")
        XCTAssertEqual(ids.profileId, "stored-p")
        XCTAssertEqual(ids.userId, "u-1")
    }

    func testCallersProfileIdWinsAndStoredIsNotRead() {
        var storedRead = false
        let ids = IntemptReactNative.flagContextIds(
            from: ["userId": "u-1", "profileId": "caller-p"],
            storedProfileId: { storedRead = true; return "stored-p" }())
        XCTAssertEqual(ids.profileId, "caller-p")
        XCTAssertEqual(ids.userId, "u-1")
        XCTAssertFalse(storedRead)
    }

    func testEmptyContextKeepsUserIdNil() {
        let ids = IntemptReactNative.flagContextIds(from: [:], storedProfileId: "stored-p")
        XCTAssertNil(ids.userId)
        XCTAssertEqual(ids.profileId, "stored-p")
    }
}
