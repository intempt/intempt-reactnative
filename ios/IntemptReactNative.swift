//
//  IntemptReactNative.swift
//  intempt-react-native
//
//  Copyright © 2026 Intempt Technologies, Inc.
//  Licensed under the Apache License, Version 2.0.
//
//  Bridges intempt-swift to React Native. The instance registry lives in the
//  Swift SDK; this class holds no state beyond looking instances up by name.
//

import Foundation
import Intempt
import React

@objc(IntemptReactNative)
public class IntemptReactNative: NSObject {

    @objc public static func requiresMainQueueSetup() -> Bool {
        // Nothing here touches UIKit at construction time. AutomaticProperties
        // does resolve screen facts on the main thread, but the SDK's own
        // `initialize` warms that, not this class's init.
        return false
    }

    // MARK: - Instance lookup

    /// Resolves a named instance or rejects with the contract's error code.
    ///
    /// Every method funnels through this rather than force-unwrapping, because
    /// calling before `init()` is an integration mistake that should produce a
    /// legible error rather than a crash in someone's release build.
    private func withInstance(
        _ name: String,
        _ method: String,
        _ reject: @escaping RCTPromiseRejectBlock,
        _ body: (IntemptInstance) throws -> Void
    ) {
        // `instance(named:)` is a static on IntemptInstance, not on the Intempt
        // enum. The enum holds only SDK-wide constants; the instance registry
        // lives on the class.
        guard let instance = IntemptInstance.instance(named: name) else {
            reject(
                "not_initialized",
                "Intempt.\(method) called before init() for instance '\(name)'",
                nil)
            return
        }
        do {
            try body(instance)
        } catch {
            reject(code(for: error), error.localizedDescription, error)
        }
    }

    /// Maps `IntemptError` onto the contract's wire codes.
    private func code(for error: Error) -> String {
        guard let intemptError = error as? IntemptError else { return "unknown" }
        switch intemptError {
        case .malformedAPIKey: return "malformed_api_key"
        case .missingConfiguration: return "missing_configuration"
        case .invalidPropertyValue: return "invalid_property_value"
        case .missingIdentity: return "missing_identity"
        case .encodingFailed: return "encoding_failed"
        case .terminal: return "terminal"
        case .retryable: return "retryable"
        case .transport: return "transport"
        case .storageUnavailable: return "storage_unavailable"
        case .server: return "server"
        }
    }

    /// Attaches status and retryAfter so the JS layer can surface them.
    private func userInfo(for error: IntemptError) -> [String: Any] {
        switch error {
        case .terminal(let status), .server(let status, _):
            return ["status": status]
        case .retryable(let status, let retryAfter):
            var info: [String: Any] = ["status": status]
            if let retryAfter { info["retryAfter"] = retryAfter }
            return info
        default:
            return [:]
        }
    }

    private func rejectIntempt(
        _ reject: @escaping RCTPromiseRejectBlock,
        _ error: IntemptError
    ) {
        let nsError = NSError(
            domain: "com.intempt.reactnative",
            code: 0,
            userInfo: userInfo(for: error))
        reject(code(for: error), error.localizedDescription, nsError)
    }

    // MARK: - Lifecycle

    @objc
    func initialize(
        _ instanceName: String,
        apiKey: String,
        orgId: String,
        projectId: String,
        sourceId: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            _ = try IntemptInstance.initialize(
                apiKey: apiKey,
                orgId: orgId,
                projectId: projectId,
                sourceId: sourceId,
                instanceName: instanceName)
            resolve(nil)
        } catch let error as IntemptError {
            rejectIntempt(reject, error)
        } catch {
            reject("unknown", error.localizedDescription, error)
        }
    }

    // MARK: - Capture

    @objc
    func track(
        _ instanceName: String,
        eventTitle: String,
        data: [String: Any]?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "track", reject) { instance in
            resolve(instance.track(eventTitle: eventTitle, data: TypeBridge.properties(data)))
        }
    }

    /// `eventTitle` is optional because Android reserves the name "identify"
    /// and rejects it case-insensitively, so JS can no longer send a default.
    /// The two SDKs disagree here — intempt-swift *defaults* to "Identify" and
    /// has no forbidden-name guard — so nil falls through to each platform's
    /// own default rather than being normalised in the bridge.
    @objc
    func identify(
        _ instanceName: String,
        userId: String,
        eventTitle: String?,
        userAttributes: [String: Any]?,
        data: [String: Any]?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "identify", reject) { instance in
            if let eventTitle {
                resolve(
                    instance.identify(
                        userId: userId,
                        eventTitle: eventTitle,
                        userAttributes: TypeBridge.properties(userAttributes),
                        data: TypeBridge.properties(data)))
            } else {
                resolve(
                    instance.identify(
                        userId: userId,
                        userAttributes: TypeBridge.properties(userAttributes),
                        data: TypeBridge.properties(data)))
            }
        }
    }

    /// Optional for the same reason as `identify`.
    @objc
    func group(
        _ instanceName: String,
        accountId: String,
        eventTitle: String?,
        accountAttributes: [String: Any]?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "group", reject) { instance in
            if let eventTitle {
                resolve(
                    instance.group(
                        accountId: accountId,
                        eventTitle: eventTitle,
                        accountAttributes: TypeBridge.properties(accountAttributes)))
            } else {
                resolve(
                    instance.group(
                        accountId: accountId,
                        accountAttributes: TypeBridge.properties(accountAttributes)))
            }
        }
    }

    @objc
    func alias(
        _ instanceName: String,
        userId: String,
        anotherUserId: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "alias", reject) { instance in
            resolve(instance.alias(userId: userId, anotherUserId: anotherUserId))
        }
    }

    @objc
    func record(
        _ instanceName: String,
        eventTitle: String,
        userId: String?,
        accountId: String?,
        data: [String: Any]?,
        userAttributes: [String: Any]?,
        accountAttributes: [String: Any]?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "record", reject) { instance in
            resolve(
                instance.record(
                    eventTitle: eventTitle,
                    userId: userId,
                    accountId: accountId,
                    data: TypeBridge.properties(data),
                    userAttributes: TypeBridge.properties(userAttributes),
                    accountAttributes: TypeBridge.properties(accountAttributes)))
        }
    }

    // MARK: - Commerce

    @objc
    func productAdd(
        _ instanceName: String,
        productId: String,
        quantity: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "productAdd", reject) { instance in
            resolve(instance.productAdd(productId: productId, quantity: quantity.intValue))
        }
    }

    @objc
    func productView(
        _ instanceName: String,
        productId: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "productView", reject) { instance in
            resolve(instance.productView(productId: productId))
        }
    }

    @objc
    func productOrdered(
        _ instanceName: String,
        products: [[String: Any]],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "productOrdered", reject) { instance in
            // A malformed entry is rejected rather than silently skipped. A
            // dropped line item in an order is a revenue number that is quietly
            // wrong, which is worse than a loud failure.
            var pairs: [(productId: String, quantity: Int)] = []
            for entry in products {
                guard
                    let productId = entry["productId"] as? String,
                    let quantity = (entry["quantity"] as? NSNumber)?.intValue
                else {
                    reject(
                        "invalid_property_value",
                        "productOrdered entries require productId (String) and quantity (Int)",
                        nil)
                    return
                }
                pairs.append((productId: productId, quantity: quantity))
            }
            resolve(instance.productOrdered(products: pairs))
        }
    }

    // MARK: - Consent

    @objc
    func consent(
        _ instanceName: String,
        action: String,
        validUntil: NSNumber,
        email: String?,
        message: String?,
        category: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let consentAction = ConsentAction(rawValue: action) else {
            reject(
                "invalid_property_value",
                "consent action must be one of: "
                    + ConsentAction.allCases.map(\.rawValue).joined(separator: ", "),
                nil)
            return
        }
        withInstance(instanceName, "consent", reject) { instance in
            resolve(
                instance.consent(
                    action: consentAction,
                    validUntil: validUntil.doubleValue,
                    email: email,
                    message: message,
                    category: category))
        }
    }

    // MARK: - Identity

    @objc
    func getProfileId(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "getProfileId", reject) { resolve($0.getProfileId()) }
    }

    @objc
    func getSessionId(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "getSessionId", reject) { resolve($0.getSessionId()) }
    }

    @objc
    func logOut(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "logOut", reject) { instance in
            instance.logOut()
            resolve(nil)
        }
    }

    @objc
    func reset(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "reset", reject) { instance in
            instance.reset()
            resolve(nil)
        }
    }

    // MARK: - Opt in / out

    @objc
    func optIn(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "optIn", reject) { instance in
            instance.optIn()
            resolve(nil)
        }
    }

    @objc
    func optOut(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "optOut", reject) { instance in
            instance.optOut()
            resolve(nil)
        }
    }

    @objc
    func hasOptedOut(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "hasOptedOut", reject) { resolve($0.hasOptedOut()) }
    }

    // MARK: - Delivery

    @objc
    func flush(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "flush", reject) { instance in
            instance.flush { delivered in resolve(delivered) }
        }
    }

    @objc
    func getFlushInterval(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "getFlushInterval", reject) { resolve($0.flushInterval) }
    }

    @objc
    func setFlushInterval(
        _ instanceName: String,
        seconds: NSNumber,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "setFlushInterval", reject) { instance in
            instance.flushInterval = seconds.doubleValue
            resolve(nil)
        }
    }

    // MARK: - Personalization


    @objc
    func products(
        _ instanceName: String,
        feedId: String,
        count: NSNumber,
        fields: [String],
        productId: String?,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "products", reject) { instance in
            instance.products(
                feedId: feedId, count: count.intValue, fields: fields, productId: productId
            ) { result in
                switch result {
                case .success(let recommendations):
                    resolve(recommendations.map(TypeBridge.dictionary(from:)))
                case .failure(let error):
                    self.rejectIntempt(reject, error)
                }
            }
        }
    }

    // MARK: - Automatic events

    @objc
    func getAutomaticEvents(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "getAutomaticEvents", reject) { instance in
            let options = instance.automaticEvents
            resolve([
                "sessions": options.sessions,
                "versionChanges": options.versionChanges,
                "appStateChanges": options.appStateChanges,
            ])
        }
    }

    @objc
    func setAutomaticEvents(
        _ instanceName: String,
        options: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "setAutomaticEvents", reject) { instance in
            let current = instance.automaticEvents
            // An absent key leaves that toggle alone. Defaulting a missing key
            // to false would silently disable session tracking for a caller
            // who only meant to change versionChanges.
            instance.automaticEvents = AutomaticEventOptions(
                sessions: options["sessions"] as? Bool ?? current.sessions,
                versionChanges: options["versionChanges"] as? Bool ?? current.versionChanges,
                appStateChanges: options["appStateChanges"] as? Bool ?? current.appStateChanges)
            resolve(nil)
        }
    }

    // MARK: - Autocapture

    /// Maps the contract's two concepts onto Apple's five options.
    ///
    /// `rawTouches` is deliberately left off and is not reachable from
    /// JavaScript. A tap on a control already emits its own event, so enabling
    /// raw touches alongside `taps` double-counts every button press. It stays
    /// in the platform annex for callers using the Swift SDK directly.
    @objc
    func configureAutocapture(
        _ instanceName: String,
        options: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "autocapture.configure", reject) { instance in
            let screenViews = options["screenViews"] as? Bool ?? false
            let controlInteractions = options["controlInteractions"] as? Bool ?? false

            instance.autocapture.configure(
                AutocaptureOptions(
                    screens: screenViews,
                    taps: controlInteractions,
                    controlChanges: controlInteractions,
                    screenExits: screenViews,
                    rawTouches: false))
            resolve(nil)
        }
    }

    @objc
    func startAutocapture(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "autocapture.start", reject) { instance in
            instance.autocapture.start()
            resolve(nil)
        }
    }

    @objc
    func stopAutocapture(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "autocapture.stop", reject) { instance in
            instance.autocapture.stop()
            resolve(nil)
        }
    }

    @objc
    func isAutocaptureRunning(
        _ instanceName: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "autocapture.isRunning", reject) {
            resolve($0.autocapture.isRunning)
        }
    }

    // MARK: - Push

    @objc
    func setPushToken(
        _ instanceName: String,
        token: String,
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        // React Native surfaces the APNs token as hex, because Data does not
        // cross the bridge. The SDK takes Data, so it is decoded back here.
        guard let data = TypeBridge.data(fromHex: token) else {
            reject(
                "invalid_property_value",
                "setPushToken expects the APNs device token as a hex string",
                nil)
            return
        }
        withInstance(instanceName, "setPushToken", reject) { resolve($0.setPushToken(data)) }
    }

    @objc
    func trackPushOpen(
        _ instanceName: String,
        payload: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "trackPushOpen", reject) { resolve($0.trackPushOpen(payload)) }
    }

    @objc
    func trackPushReceived(
        _ instanceName: String,
        payload: [String: Any],
        resolver resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        withInstance(instanceName, "trackPushReceived", reject) {
            resolve($0.trackPushReceived(payload))
        }
    }

    // MARK: - Diagnostics

    @objc
    func getSdkVersion(
        _ resolve: @escaping RCTPromiseResolveBlock,
        rejecter reject: @escaping RCTPromiseRejectBlock
    ) {
        resolve(Intempt.sdkVersion)
    }
}
