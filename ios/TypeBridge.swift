//
//  TypeBridge.swift
//  intempt-react-native
//
//  Copyright © 2026 Intempt Technologies, Inc.
//  Licensed under the Apache License, Version 2.0.
//
//  Conversions between React Native's bridge types and intempt-swift's.
//

import Foundation
import Intempt

enum TypeBridge {

    /// Converts a bridge dictionary into the SDK's typed property map.
    ///
    /// The bridge delivers NSString, NSNumber, NSNull, NSArray and
    /// NSDictionary. All five already conform to `IntemptType`, so the work
    /// here is narrowing `Any` rather than converting values — with one
    /// exception, noted on `value(_:)`.
    static func properties(_ input: [String: Any]?) -> [String: IntemptType]? {
        guard let input else { return nil }
        var output: [String: IntemptType] = [:]
        for (key, raw) in input {
            output[key] = value(raw)
        }
        return output
    }

    /// Narrows one bridge value.
    ///
    /// JavaScript has no Date, so a Date crossed the bridge as an ISO 8601
    /// string and is left as a string here. Re-parsing it would be guesswork:
    /// a caller's own string that happens to look like a timestamp would be
    /// silently retyped, and the wire format for both is a string anyway.
    /// `CONTRACT.md` records the wire representation, and it is the string.
    static func value(_ raw: Any) -> IntemptType {
        switch raw {
        case let string as String: return string
        case let number as NSNumber: return number
        case let array as [Any]: return array.map(value(_:))
        case let dictionary as [String: Any]:
            return dictionary.mapValues(value(_:))
        case is NSNull: return NSNull()
        default:
            // Unreachable via the bridge, which cannot carry anything else.
            // Stringifying beats dropping: a surprising value in the payload is
            // debuggable, a missing key is not.
            return String(describing: raw)
        }
    }


    static func dictionary(from product: ProductRecommendation) -> [String: Any] {
        var output: [String: Any] = ["attributes": product.attributes]
        if let productId = product.productId { output["productId"] = productId }
        if let title = product.title { output["title"] = title }
        if let imageURL = product.imageURL { output["imageUrl"] = imageURL }
        if let url = product.url { output["url"] = url }
        if let price = product.price { output["price"] = price }
        return output
    }

    /// Converts a `JSONValue` to something the bridge can carry.
    ///
    /// The inverse of `value(_:)`. A flag payload is arbitrary JSON authored in the studio, so it
    /// crosses as-is rather than being flattened into a known shape — the caller branches on it.
    /// Objects and arrays recurse; `putValue` on the Kotlin side performs the same traversal, and
    /// the two platforms must not disagree about the same payload.
    static func any(from value: JSONValue) -> Any {
        switch value {
        case .string(let s): return s
        case .number(let n): return n
        case .bool(let b): return b
        case .object(let o): return o.mapValues { any(from: $0) }
        case .array(let a): return a.map { any(from: $0) }
        case .null: return NSNull()
        }
    }

    /// Decodes an APNs device token from its hex representation.
    ///
    /// `Data` does not cross the bridge, so React Native surfaces the token as
    /// hex. Returns nil on odd length or a non-hex character rather than
    /// producing a truncated token, which would register the device for pushes
    /// it never receives.
    static func data(fromHex hex: String) -> Data? {
        let characters = Array(hex)
        guard !characters.isEmpty, characters.count % 2 == 0 else { return nil }

        var bytes = [UInt8]()
        bytes.reserveCapacity(characters.count / 2)

        for index in stride(from: 0, to: characters.count, by: 2) {
            guard let byte = UInt8(String(characters[index...index + 1]), radix: 16) else {
                return nil
            }
            bytes.append(byte)
        }
        return Data(bytes)
    }
}
