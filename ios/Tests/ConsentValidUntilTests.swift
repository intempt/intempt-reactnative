import XCTest

@testable import IntemptReactNative

// Not in jest or CI: runs only through the podspec's `Tests` test_spec (see the podspec).
final class ConsentValidUntilTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_700_000_000)

    func testFutureTimeBecomesSecondsFromNow() {
        XCTAssertEqual(
            IntemptReactNative.consentDuration(untilUnixSeconds: 1_700_003_600, now: now), 3600)
    }

    func testPastTimeClampsToZero() {
        XCTAssertEqual(
            IntemptReactNative.consentDuration(untilUnixSeconds: 1_699_999_000, now: now), 0)
    }

    func testNowIsZero() {
        XCTAssertEqual(
            IntemptReactNative.consentDuration(untilUnixSeconds: 1_700_000_000, now: now), 0)
    }

    // intempt-swift sends a duration no epoch can hold as -1, unlimited; the clamp must keep it.
    func testInfinityStaysInfinity() {
        XCTAssertEqual(
            IntemptReactNative.consentDuration(untilUnixSeconds: .infinity, now: now), .infinity)
    }

    func testNaNClampsToZero() {
        XCTAssertEqual(
            IntemptReactNative.consentDuration(untilUnixSeconds: .nan, now: now), 0)
    }
}
