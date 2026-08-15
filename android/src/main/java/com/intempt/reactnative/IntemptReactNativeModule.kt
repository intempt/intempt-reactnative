package com.intempt.reactnative

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.intempt.core.Intempt

/**
 * Bridges intempt-android to React Native.
 *
 * Written against the SDK API contract
 * (intempt-swift/docs/SDK-API-CONTRACT.md), not against intempt-android's
 * current surface. Contract methods that intempt-android has not adopted yet
 * reject with `unsupported_on_android` and the method name, so a React Native
 * caller gets a legible answer rather than a missing function.
 *
 * Every one of those rejections is a conformance gap that disappears when
 * intempt-android 3.0 lands. They are listed in one place — [unsupported] —
 * rather than scattered, so the remaining gap is countable.
 */
class IntemptReactNativeModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /**
     * Rejects a contract method intempt-android does not expose yet.
     *
     * The message names the contract item so the failure is traceable to a
     * specific piece of work rather than reading as a bug in this package.
     */
    private fun unsupported(promise: Promise, method: String, contractItem: String) {
        promise.reject(
            "unsupported_on_android",
            "Intempt.$method is not available on intempt-android yet. " +
                "Contract item: $contractItem. Arrives in intempt-android 3.0.",
        )
    }

    /** Runs [body], converting any throw into a contract error code. */
    private inline fun guarded(promise: Promise, method: String, body: () -> Unit) {
        try {
            body()
        } catch (e: UninitializedPropertyAccessException) {
            promise.reject(
                "not_initialized",
                "Intempt.$method called before init()",
                e,
            )
        } catch (e: IllegalArgumentException) {
            promise.reject("invalid_property_value", e.message ?: "invalid argument", e)
        } catch (e: Exception) {
            promise.reject("unknown", e.message ?: "Intempt.$method failed", e)
        }
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    /**
     * intempt-android reads credentials from `assets/intempt-config.json` and
     * its `initialize` takes only a Context. The credentials passed here cannot
     * reach it until 3.0 adds a runtime-credential entry point.
     *
     * Rather than accept them and silently ignore them — which would look like
     * a working integration sending events to nowhere — this fails loudly when
     * the asset is absent, and says exactly what to do.
     */
    @ReactMethod
    fun initialize(
        instanceName: String,
        apiKey: String,
        orgId: String,
        projectId: String,
        sourceId: String,
        promise: Promise,
    ) {
        if (instanceName != DEFAULT_INSTANCE) {
            unsupported(
                promise,
                "init(instanceName = \"$instanceName\")",
                "named instances; intempt-android is a singleton object",
            )
            return
        }

        guarded(promise, "init") {
            val ok = Intempt.initialize(reactContext)
            if (ok && Intempt.isInitialized()) {
                promise.resolve(null)
            } else {
                promise.reject(
                    "missing_configuration",
                    "intempt-android could not initialise. Until 3.0 it reads credentials " +
                        "from android/app/src/main/assets/intempt-config.json and ignores the " +
                        "ones passed to init(). Add that file, or upgrade to intempt-android 3.0 " +
                        "which accepts credentials at runtime.",
                )
            }
        }
    }

    // ---------------------------------------------------------------------
    // Capture
    // ---------------------------------------------------------------------

    @ReactMethod
    fun track(instanceName: String, eventTitle: String, data: ReadableMap?, promise: Promise) {
        guarded(promise, "track") {
            Intempt.track(eventTitle, ReadableMapConverter.toStringMap(data).orEmpty())
            // intempt-android returns Unit, so there is no acceptance signal to
            // forward. Resolving true here would be a lie the contract's Bool
            // return is supposed to prevent; 3.0 returns the real value.
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun identify(
        instanceName: String,
        userId: String,
        eventTitle: String,
        userAttributes: ReadableMap?,
        data: ReadableMap?,
        promise: Promise,
    ) {
        guarded(promise, "identify") {
            Intempt.identify(
                userId,
                eventTitle,
                ReadableMapConverter.toStringMap(userAttributes),
                ReadableMapConverter.toStringMap(data),
            )
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun group(
        instanceName: String,
        accountId: String,
        eventTitle: String,
        accountAttributes: ReadableMap?,
        promise: Promise,
    ) {
        guarded(promise, "group") {
            Intempt.group(
                accountId,
                eventTitle,
                ReadableMapConverter.toStringMap(accountAttributes),
            )
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun alias(instanceName: String, userId: String, anotherUserId: String, promise: Promise) {
        guarded(promise, "alias") {
            Intempt.alias(userId, anotherUserId)
            promise.resolve(true)
        }
    }

    /**
     * Note the argument order handed to the SDK.
     *
     * The contract orders these `(title, userId, accountId, data, userAttrs,
     * accountAttrs)`. intempt-android orders them `(title, accountId, userId,
     * accountAttrs, userAttrs, data)` — identifiers swapped and attributes
     * reversed. The re-ordering below is the whole reason this comment exists;
     * it disappears when 3.0 adopts the contract order.
     */
    @ReactMethod
    fun record(
        instanceName: String,
        eventTitle: String,
        userId: String?,
        accountId: String?,
        data: ReadableMap?,
        userAttributes: ReadableMap?,
        accountAttributes: ReadableMap?,
        promise: Promise,
    ) {
        guarded(promise, "record") {
            Intempt.record(
                eventTitle,
                accountId,
                userId,
                ReadableMapConverter.toStringMap(accountAttributes),
                ReadableMapConverter.toStringMap(userAttributes),
                ReadableMapConverter.toStringMap(data),
            )
            promise.resolve(true)
        }
    }

    // ---------------------------------------------------------------------
    // Commerce
    // ---------------------------------------------------------------------

    @ReactMethod
    fun productAdd(instanceName: String, productId: String, quantity: Double, promise: Promise) {
        guarded(promise, "productAdd") {
            Intempt.productAdd(productId, quantity.toInt())
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun productView(instanceName: String, productId: String, promise: Promise) {
        guarded(promise, "productView") {
            Intempt.productView(productId)
            promise.resolve(true)
        }
    }

    @ReactMethod
    fun productOrdered(instanceName: String, products: ReadableArray, promise: Promise) {
        guarded(promise, "productOrdered") {
            val parsed = ReadableMapConverter.toOrderedProducts(products)
            Intempt.productOrdered(parsed)
            promise.resolve(true)
        }
    }

    // ---------------------------------------------------------------------
    // Consent
    // ---------------------------------------------------------------------

    @ReactMethod
    fun consent(
        instanceName: String,
        action: String,
        validUntil: Double,
        email: String?,
        message: String?,
        category: String?,
        promise: Promise,
    ) {
        if (action !in CONSENT_ACTIONS) {
            promise.reject(
                "invalid_property_value",
                "consent action must be one of: ${CONSENT_ACTIONS.joinToString(", ")}",
            )
            return
        }
        guarded(promise, "consent") {
            Intempt.consent(action, validUntil.toLong(), email, message, category)
            promise.resolve(true)
        }
    }

    // ---------------------------------------------------------------------
    // Opt in / out — names differ, behaviour maps cleanly
    // ---------------------------------------------------------------------

    @ReactMethod
    fun optIn(instanceName: String, promise: Promise) {
        guarded(promise, "optIn") {
            Intempt.Tracking.start()
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun optOut(instanceName: String, promise: Promise) {
        guarded(promise, "optOut") {
            Intempt.Tracking.stop()
            promise.resolve(null)
        }
    }

    @ReactMethod
    fun hasOptedOut(instanceName: String, promise: Promise) {
        guarded(promise, "hasOptedOut") {
            promise.resolve(!Intempt.Tracking.isTrackingEnabled())
        }
    }

    @ReactMethod
    fun logOut(instanceName: String, promise: Promise) {
        guarded(promise, "logOut") {
            Intempt.logOut()
            promise.resolve(null)
        }
    }

    // ---------------------------------------------------------------------
    // Conformance gaps. Each disappears with intempt-android 3.0.
    // ---------------------------------------------------------------------

    @ReactMethod
    fun reset(instanceName: String, promise: Promise) =
        unsupported(promise, "reset", "reset() — new identity and empty queue")

    @ReactMethod
    fun getProfileId(instanceName: String, promise: Promise) =
        unsupported(promise, "getProfileId", "identity accessors")

    @ReactMethod
    fun getSessionId(instanceName: String, promise: Promise) =
        unsupported(promise, "getSessionId", "identity accessors")

    @ReactMethod
    fun flush(instanceName: String, promise: Promise) =
        unsupported(
            promise,
            "flush",
            "flush() on the instance; today it exists only on com.intempt.core.queue.DeliveryMessages",
        )

    @ReactMethod
    fun getFlushInterval(instanceName: String, promise: Promise) =
        unsupported(promise, "getFlushInterval", "flushInterval on the instance")

    @ReactMethod
    fun setFlushInterval(instanceName: String, seconds: Double, promise: Promise) =
        unsupported(promise, "setFlushInterval", "flushInterval on the instance")

    @ReactMethod
    fun experiments(
        instanceName: String,
        names: ReadableArray?,
        groups: ReadableArray?,
        optimizationType: String?,
        productId: String?,
        promise: Promise,
    ) = unsupported(
        promise,
        "experiments",
        "experiments(names, groups, optimizationType, productId) — absent from app.api entirely",
    )

    @ReactMethod
    fun products(
        instanceName: String,
        feedId: String,
        count: Double,
        fields: ReadableArray,
        productId: String?,
        promise: Promise,
    ) = unsupported(
        promise,
        "products",
        "products(feedId, count, fields, productId); the nearest existing call is the suspend " +
            "recommendation(), which has no bridgeable signature",
    )

    @ReactMethod
    fun getAutomaticEvents(instanceName: String, promise: Promise) =
        unsupported(
            promise,
            "getAutomaticEvents",
            "runtime automatic-event toggles; today they are read once from the config asset",
        )

    @ReactMethod
    fun setAutomaticEvents(instanceName: String, options: ReadableMap, promise: Promise) =
        unsupported(
            promise,
            "setAutomaticEvents",
            "runtime automatic-event toggles; today they are read once from the config asset",
        )

    @ReactMethod
    fun setPushToken(instanceName: String, token: String, promise: Promise) =
        unsupported(
            promise,
            "setPushToken",
            "public push API; the logic exists in FirebaseService but is not exposed",
        )

    @ReactMethod
    fun trackPushOpen(instanceName: String, payload: ReadableMap, promise: Promise) =
        unsupported(promise, "trackPushOpen", "public push API")

    @ReactMethod
    fun trackPushReceived(instanceName: String, payload: ReadableMap, promise: Promise) =
        unsupported(promise, "trackPushReceived", "public push API")

    // ---------------------------------------------------------------------
    // Diagnostics
    // ---------------------------------------------------------------------

    @ReactMethod
    fun getSdkVersion(promise: Promise) {
        guarded(promise, "getSdkVersion") {
            promise.resolve(com.intempt.core.BuildConfig.sdkVersion)
        }
    }

    companion object {
        const val NAME = "IntemptReactNative"
        private const val DEFAULT_INSTANCE = "default"
        private val CONSENT_ACTIONS = setOf("accept", "reject")
    }
}
