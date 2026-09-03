//
//  IntemptReactNative.mm
//  intempt-react-native
//
//  Copyright © 2026 Intempt Technologies, Inc.
//  Licensed under the Apache License, Version 2.0.
//
//  Exposes the Swift module to React Native.
//
//  A .mm rather than a .m so the same file serves both architectures: the
//  RCT_EXTERN_MODULE declarations register the module on the legacy bridge, and
//  the getTurboModule override at the bottom binds the codegen-generated spec
//  on the new architecture.
//

#import <React/RCTBridgeModule.h>

#ifdef RCT_NEW_ARCH_ENABLED
#import <RNIntemptSpec/RNIntemptSpec.h>
#endif

@interface RCT_EXTERN_MODULE (IntemptReactNative, NSObject)

// MARK: - Lifecycle

RCT_EXTERN_METHOD(initialize
                  : (NSString *)instanceName apiKey
                  : (NSString *)apiKey orgId
                  : (NSString *)orgId projectId
                  : (NSString *)projectId sourceId
                  : (NSString *)sourceId useIpAddressForGeolocation
                  : (nullable NSNumber *)useIpAddressForGeolocation resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Capture

RCT_EXTERN_METHOD(track
                  : (NSString *)instanceName eventTitle
                  : (NSString *)eventTitle data
                  : (nullable NSDictionary *)data resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(identify
                  : (NSString *)instanceName userId
                  : (NSString *)userId eventTitle
                  : (nullable NSString *)eventTitle userAttributes
                  : (nullable NSDictionary *)userAttributes data
                  : (nullable NSDictionary *)data resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(group
                  : (NSString *)instanceName accountId
                  : (NSString *)accountId eventTitle
                  : (nullable NSString *)eventTitle accountAttributes
                  : (nullable NSDictionary *)accountAttributes resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(record
                  : (NSString *)instanceName eventTitle
                  : (NSString *)eventTitle userId
                  : (nullable NSString *)userId accountId
                  : (nullable NSString *)accountId data
                  : (nullable NSDictionary *)data userAttributes
                  : (nullable NSDictionary *)userAttributes accountAttributes
                  : (nullable NSDictionary *)accountAttributes resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Commerce

RCT_EXTERN_METHOD(productAdd
                  : (NSString *)instanceName productId
                  : (NSString *)productId quantity
                  : (nonnull NSNumber *)quantity resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(productView
                  : (NSString *)instanceName productId
                  : (NSString *)productId resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(productOrdered
                  : (NSString *)instanceName products
                  : (NSArray *)products resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Consent

RCT_EXTERN_METHOD(consent
                  : (NSString *)instanceName action
                  : (NSString *)action validUntil
                  : (nonnull NSNumber *)validUntil email
                  : (nullable NSString *)email message
                  : (nullable NSString *)message category
                  : (nullable NSString *)category resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Identity

RCT_EXTERN_METHOD(getProfileId
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getSessionId
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(logOut
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(reset
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Opt in / out

RCT_EXTERN_METHOD(optIn
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(optOut
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(hasOptedOut
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Delivery

RCT_EXTERN_METHOD(flush
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getFlushInterval
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setFlushInterval
                  : (NSString *)instanceName seconds
                  : (nonnull NSNumber *)seconds resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Flags

RCT_EXTERN_METHOD(variation
                  : (NSString *)instanceName key
                  : (NSString *)key context
                  : (NSDictionary *)context defaultValue
                  : (NSDictionary *)defaultValue resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(allFlags
                  : (NSString *)instanceName context
                  : (NSDictionary *)context resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Personalization

RCT_EXTERN_METHOD(products
                  : (NSString *)instanceName feedId
                  : (NSString *)feedId count
                  : (nonnull NSNumber *)count fields
                  : (NSArray *)fields productId
                  : (nullable NSString *)productId resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Automatic events

RCT_EXTERN_METHOD(getAutomaticEvents
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setAutomaticEvents
                  : (NSString *)instanceName options
                  : (NSDictionary *)options resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Autocapture

RCT_EXTERN_METHOD(configureAutocapture
                  : (NSString *)instanceName options
                  : (NSDictionary *)options resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(startAutocapture
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(stopAutocapture
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(isAutocaptureRunning
                  : (NSString *)instanceName resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Push

RCT_EXTERN_METHOD(setPushToken
                  : (NSString *)instanceName token
                  : (NSString *)token resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(trackPushOpen
                  : (NSString *)instanceName payload
                  : (NSDictionary *)payload resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(trackPushReceived
                  : (NSString *)instanceName payload
                  : (NSDictionary *)payload resolver
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

// MARK: - Diagnostics

RCT_EXTERN_METHOD(getSdkVersion
                  : (RCTPromiseResolveBlock)resolve rejecter
                  : (RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup {
  return NO;
}

@end
