package com.intempt.reactnative

import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CoroutineScope
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap
import com.intempt.core.types.FlagContext
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.intempt.core.Intempt
import com.intempt.core.IntemptInstance
import com.intempt.core.types.AutocaptureOptions
import com.intempt.core.types.AutomaticEventsOptions
import com.intempt.core.types.ConsentAction
import com.intempt.core.types.IntemptCredentials
import com.intempt.core.types.IntemptRuntimeOptions
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Bridges intempt-android to React Native.
 *
 * Written against intempt-android 3.0, which conforms to the SDK API contract
 * (intempt-swift/docs/SDK-API-CONTRACT.md). An earlier version of this file was
 * written against 2.x and carried five compensation shims: it re-ordered
 * record()'s arguments, flattened typed values to strings, resolved an
 * unconditional `true` because the SDK returned Unit, ignored the credentials
 * passed to init(), and rejected sixteen methods as unsupported.
 *
 * All five are gone, and they were not merely redundant against 3.0. The
 * record() re-ordering would have swapped userId and accountId on every call —
 * events would have kept flowing, attributed to the wrong entity, with nothing
 * failing anywhere.
 *
 * Push is the only genuine gap left. setPushToken, trackPushOpen and
 * trackPushReceived are absent from 3.0's public surface — verified against
 * app/api/app.api, not inferred — because registration lives inside
 * FirebaseService and is not exposed.
 */
class IntemptReactNativeModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = NAME

    /**
     * intempt-android's flag methods are `suspend`. This module had no coroutine machinery
     * before; the alternative was runBlocking, which parks a React Native worker for the length
     * of a network round trip. SupervisorJob so one failed evaluation cannot cancel the scope.
     */
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private val flagHandles = FlagHandles()

    override fun invalidate() {
        flagHandles.clear()
        scope.cancel()
        super.invalidate()
    }

    /** Rejects a contract method intempt-android does not expose. */
    private fun unsupported(promise: Promise, method: String, detail: String) {
        promise.reject(
            "unsupported_on_android",
            "Intempt.$method is not available on intempt-android. $detail",
        )
    }

    /**
     * Resolves a named instance, or rejects legibly.
     *
     * Calling before init() is an integration mistake that should produce a
     * readable error rather than a null-pointer crash in someone's release build.
     */
    private inline fun withInstance(
        instanceName: String,
        method: String,
        promise: Promise,
        body: (IntemptInstance) -> Unit,
    ) {
        val instance = Intempt.instance(instanceName)
        if (instance == null) {
            promise.reject(
                "not_initialized",
                "Intempt.$method called before init() for instance '$instanceName'",
            )
            return
        }
        try {
            body(instance)
        } catch (e: IllegalArgumentException) {
            promise.reject("invalid_property_value", e.message ?: "invalid argument", e)
        } catch (e: Exception) {
            promise.reject("unknown", e.message ?: "Intempt.$method failed", e)
        }
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    @ReactMethod
    fun initialize(
        instanceName: String,
        apiKey: String,
        orgId: String,
        projectId: String,
        sourceId: String,
        useIpAddressForGeolocation: Boolean?,
        promise: Promise,
    ) {
        try {
            val credentials = IntemptCredentials(apiKey, orgId, projectId, sourceId)
            val problems = credentials.problems()
            if (problems.isNotEmpty()) {
                // problems() names the actual failure. The blanks are already
                // rejected in JS, so the branch that survives to here is almost
                // always a malformed apiKey ("<id>.<secret>"), which a message
                // about non-blank fields actively misdirects.
                promise.reject("missing_configuration", problems.joinToString("; "))
                return
            }
            // The three-argument overload creates a NAMED instance. The asset file
            // (assets/intempt-config.json) is still supported by the SDK for apps
            // that prefer it, but is no longer the only path — which is what made
            // the SDK wrappable at all.
            //
            // It returns null on every failure path in Intempt.start(): a blank
            // instance name, a graph that failed to construct, or a lost init
            // race. Resolving regardless would hand JS a registry entry whose
            // every later call rejects `not_initialized` — the same lie as the
            // unconditional `true` this module used to return.
            // An RN app has no asset file to edit, so the four-argument overload is the only way
            // this option can reach the SDK at all. Passed explicitly rather than left to the asset
            // file: the value JS supplied is the one the developer chose.
            // Null when JS did not supply it, so assets/intempt-config.json stays
            // authoritative. Passing a value here overrides the file.
            val options = IntemptRuntimeOptions(useIpAddressForGeolocation = useIpAddressForGeolocation)
            if (Intempt.initialize(reactContext, credentials, instanceName, options) == null) {
                promise.reject(
                    "missing_configuration",
                    "Intempt.init could not create instance '$instanceName'. " +
                        "The instance name must be non-blank.",
                )
                return
            }
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("unknown", e.message ?: "Intempt.init failed", e)
        }
    }

    // ---------------------------------------------------------------------
    // Capture — every method forwards the SDK's real Boolean
    // ---------------------------------------------------------------------

    @ReactMethod
    fun track(instanceName: String, eventTitle: String, data: ReadableMap?, promise: Promise) =
        withInstance(instanceName, "track", promise) {
            promise.resolve(it.track(eventTitle, ReadableMapConverter.toValueMap(data).orEmpty()))
        }

    /**
     * [eventTitle] is nullable on purpose, and JS must not default it.
     *
     * "identify" is in CustomCaptureService.forbiddenEventNames and the check is
     * case-insensitive, so a default of "Identify" makes isIdentifyValid report
     * ForbiddenEventName and return false before the event is ever built — every
     * default identify() would resolve false and queue nothing. The SDK already
     * names the event itself when this is null.
     */
    @ReactMethod
    fun identify(
        instanceName: String,
        userId: String,
        eventTitle: String?,
        userAttributes: ReadableMap?,
        data: ReadableMap?,
        promise: Promise,
    ) = withInstance(instanceName, "identify", promise) {
        promise.resolve(
            it.identify(
                userId,
                eventTitle,
                ReadableMapConverter.toValueMap(userAttributes),
                ReadableMapConverter.toValueMap(data),
            ),
        )
    }

    /** [eventTitle] nullable for the same reason as [identify]; from intempt-android 7.0.0 GroupEvent names itself "Identify". */
    @ReactMethod
    fun group(
        instanceName: String,
        accountId: String,
        eventTitle: String?,
        accountAttributes: ReadableMap?,
        promise: Promise,
    ) = withInstance(instanceName, "group", promise) {
        promise.resolve(
            it.group(accountId, eventTitle, ReadableMapConverter.toValueMap(accountAttributes)),
        )
    }

    /**
     * Contract argument order, forwarded unchanged.
     *
     * 2.x ordered these `(title, accountId, userId, acctAttrs, userAttrs, data)`
     * and this module re-ordered to compensate. 3.0 adopts the contract order, so
     * the compensation is gone. Leaving it would have silently swapped the two
     * identifiers on every call.
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
    ) = withInstance(instanceName, "record", promise) {
        promise.resolve(
            it.record(
                eventTitle,
                userId,
                accountId,
                ReadableMapConverter.toValueMap(data),
                ReadableMapConverter.toValueMap(userAttributes),
                ReadableMapConverter.toValueMap(accountAttributes),
            ),
        )
    }

    // ---------------------------------------------------------------------
    // Commerce
    // ---------------------------------------------------------------------

    @ReactMethod
    fun productAdd(instanceName: String, productId: String, quantity: Double, promise: Promise) =
        withInstance(instanceName, "productAdd", promise) {
            promise.resolve(it.productAdd(productId, quantity.toInt()))
        }

    @ReactMethod
    fun productView(instanceName: String, productId: String, promise: Promise) =
        withInstance(instanceName, "productView", promise) {
            promise.resolve(it.productView(productId))
        }

    @ReactMethod
    fun productOrdered(instanceName: String, products: ReadableArray, promise: Promise) =
        withInstance(instanceName, "productOrdered", promise) {
            promise.resolve(it.productOrdered(ReadableMapConverter.toOrderedProducts(products)))
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
        val parsed = ConsentAction.fromWireValue(action)
        if (parsed == null) {
            promise.reject(
                "invalid_property_value",
                "consent action must be one of: " +
                    ConsentAction.entries.joinToString(", ") { it.wireValue },
            )
            return
        }
        withInstance(instanceName, "consent", promise) {
            promise.resolve(it.consent(parsed, consentValidUntilMillis(validUntil), email, message, category))
        }
    }

    // ---------------------------------------------------------------------
    // Identity and lifecycle
    // ---------------------------------------------------------------------

    @ReactMethod
    fun getProfileId(instanceName: String, promise: Promise) =
        withInstance(instanceName, "getProfileId", promise) { promise.resolve(it.getProfileId()) }

    @ReactMethod
    fun getSessionId(instanceName: String, promise: Promise) =
        withInstance(instanceName, "getSessionId", promise) { promise.resolve(it.getSessionId()) }

    @ReactMethod
    fun logOut(instanceName: String, promise: Promise) =
        withInstance(instanceName, "logOut", promise) {
            flagHandles.release(instanceName)
            it.logOut()
            promise.resolve(null)
        }

    @ReactMethod
    fun reset(instanceName: String, promise: Promise) =
        withInstance(instanceName, "reset", promise) {
            flagHandles.release(instanceName)
            it.reset()
            promise.resolve(null)
        }

    // ---------------------------------------------------------------------
    // Opt in / out
    // ---------------------------------------------------------------------

    @ReactMethod
    fun optIn(instanceName: String, promise: Promise) =
        withInstance(instanceName, "optIn", promise) {
            it.optIn()
            promise.resolve(null)
        }

    @ReactMethod
    fun optOut(instanceName: String, promise: Promise) =
        withInstance(instanceName, "optOut", promise) {
            it.optOut()
            promise.resolve(null)
        }

    @ReactMethod
    fun hasOptedOut(instanceName: String, promise: Promise) =
        withInstance(instanceName, "hasOptedOut", promise) { promise.resolve(it.hasOptedOut()) }

    // ---------------------------------------------------------------------
    // Delivery
    // ---------------------------------------------------------------------

    /**
     * The only method here that does not settle synchronously, and so the only
     * one that can strand its promise.
     *
     * The completion is the sole path to resolve, and two SDK paths drop it
     * without raising: CustomCaptureComponent.flush wraps the call in
     * UtilsService.withTryCatch, which catches Throwable, logs, and returns
     * null; and DeliveryMessages.Worker.runMessage discards a FLUSH_QUEUE
     * message ("Could not restart the delivery worker, dropping") after the
     * completion is already queued. An unopenable queue DB hits the first. With
     * no timeout anywhere in the stack, `await intempt.flush()` would then never
     * resolve and never reject.
     */
    @ReactMethod
    fun flush(instanceName: String, promise: Promise) =
        withInstance(instanceName, "flush", promise) { instance ->
            val settled = AtomicBoolean(false)
            val timeout = Handler(Looper.getMainLooper())
            val expire = Runnable {
                if (settled.compareAndSet(false, true)) {
                    promise.reject(
                        "flush_timeout",
                        "Intempt.flush did not report completion within ${FLUSH_TIMEOUT_MS}ms",
                    )
                }
            }
            timeout.postDelayed(expire, FLUSH_TIMEOUT_MS)
            // The completion carries the number of events the SERVER accepted,
            // which is the only observable difference between queued and
            // delivered.
            instance.flush { delivered ->
                if (settled.compareAndSet(false, true)) {
                    timeout.removeCallbacks(expire)
                    promise.resolve(delivered)
                }
            }
        }

    @ReactMethod
    fun getFlushInterval(instanceName: String, promise: Promise) =
        withInstance(instanceName, "getFlushInterval", promise) {
            promise.resolve(it.flushInterval)
        }

    @ReactMethod
    fun setFlushInterval(instanceName: String, seconds: Double, promise: Promise) =
        withInstance(instanceName, "setFlushInterval", promise) {
            it.flushInterval = seconds.toInt()
            promise.resolve(null)
        }

    // ---------------------------------------------------------------------
    // Flags
    // ---------------------------------------------------------------------

    /**
     * Every JS flag read: intempt-android's `variationDetail`, which owns the reason, the error code,
     * the type check against `defaultValue` and the exposure. `defaultValue` arrives as `{value}` so
     * a null default can cross.
     *
     * The SDK's flag methods are `suspend`, so they run on [scope] rather than blocking the bridge
     * thread. Never rejects for a service failure or a bad key (S11): the SDK answers the default
     * with a reason, and an unexpected throw is logged and answered as GENERAL, as the SDK would.
     */
    @ReactMethod
    fun variationDetail(
        instanceName: String,
        key: String,
        context: ReadableMap,
        defaultValue: ReadableMap,
        disableExposure: Boolean,
        promise: Promise,
    ) = withInstance(instanceName, "variationDetail", promise) { instance ->
        val fallback = defaultValue.toHashMap()["value"]
        scope.launch {
            val fields =
                try {
                    flagDetailFields(
                        instance.variationDetail(key, ReadableMapConverter.toFlagContext(context), fallback, disableExposure),
                    )
                } catch (e: Exception) {
                    Log.w(NAME, "variationDetail(" + key + ") failed; resolving to the caller's default", e)
                    mapOf("value" to fallback, "reason" to "error", "errorCode" to "GENERAL")
                }
            promise.resolve(writableMap(fields))
        }
    }

    /** `options` is `{names?, groups?, disableExposure}`. Never rejects for a service failure. */
    @ReactMethod
    fun choose(
        instanceName: String,
        context: ReadableMap,
        options: ReadableMap,
        promise: Promise,
    ) = withInstance(instanceName, "choose", promise) { instance ->
        val names = ReadableMapConverter.toStringList(if (options.hasKey("names")) options.getArray("names") else null)
        val groups = ReadableMapConverter.toStringList(if (options.hasKey("groups")) options.getArray("groups") else null)
        val disableExposure = options.hasKey("disableExposure") && options.getBoolean("disableExposure")
        scope.launch {
            val choices =
                try {
                    instance.choose(names, groups, ReadableMapConverter.toFlagContext(context), disableExposure)
                } catch (e: Exception) {
                    Log.w(NAME, "choose failed; resolving to no choices", e)
                    emptyList()
                }
            promise.resolve(writableArray(choices.map(::choiceFields)))
        }
    }

    @ReactMethod
    fun allFlags(
        instanceName: String,
        context: ReadableMap,
        promise: Promise,
    ) = withInstance(instanceName, "allFlags", promise) { instance ->
        scope.launch {
            try {
                val map = instance.allFlags(ReadableMapConverter.toFlagContext(context))
                // snapshot() records nothing. Off flags (null) are left out, as intempt-swift's
                // snapshot leaves them out, so both platforms answer the same keys.
                val values = map.snapshot().filterValues { it != null }
                val token = flagHandles.register(instanceName, values.keys, map::expose)
                promise.resolve(
                    Arguments.createMap().apply {
                        token?.let { putString("token", it) }
                        putMap("values", writableMap(values))
                    },
                )
            } catch (e: Exception) {
                // Absorbed for the same reason as variation() above: the JS layer holds the
                // caller's default and an empty map is what makes it apply.
                Log.w(NAME, "allFlags failed; resolving to the caller's defaults", e)
                promise.resolve(Arguments.createMap())
            }
        }
    }

    /** A JS read of [key] from the allFlags answer [token]: that map's expose(key), once. */
    @ReactMethod
    fun exposeFlag(
        token: String,
        key: String,
        promise: Promise,
    ) {
        flagHandles.expose(token, key)
        promise.resolve(null)
    }

    /** The native onFlagError for one instance, forwarded as an `IntemptFlagError` event. */
    @ReactMethod
    fun setFlagErrorListener(
        instanceName: String,
        enabled: Boolean,
        promise: Promise,
    ) = withInstance(instanceName, "setFlagErrorListener", promise) { instance ->
        instance.onFlagError =
            if (enabled) {
                { error ->
                    reactApplicationContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit(FLAG_ERROR_EVENT, writableMap(flagErrorFields(instanceName, error)))
                }
            } else {
                null
            }
        promise.resolve(null)
    }

    // NativeEventEmitter calls these and warns when they are missing. Android emits regardless of
    // listener count, so there is nothing to track.
    @ReactMethod
    fun addListener(eventName: String) = Unit

    @ReactMethod
    fun removeListeners(count: Double) = Unit

    /**
     * A flag payload is arbitrary JSON, so it crosses with its type preserved.
     *
     * Objects and arrays RECURSE. Kotlin's `toString()` on a Map renders `{a=1, b=2}`, which is
     * not JSON and does not parse, so a caller reading `variation<{theme: string}>(...)` used to
     * get an object on iOS and a broken string here. `TypeBridge.any(from:)` recurses on the
     * Swift side; this is the same traversal, and the two platforms must not disagree about the
     * same payload.
     */
    private fun putValue(map: WritableMap, key: String, value: Any?) {
        when (val unwrapped = unwrapJson(value)) {
            null -> map.putNull(key)
            is Boolean -> map.putBoolean(key, unwrapped)
            is Int -> map.putInt(key, unwrapped)
            is Double -> map.putDouble(key, unwrapped)
            // Long, Float and any other Number cross as a double: the bridge carries no wider
            // numeric type, and putString would change the payload's JSON type.
            is Number -> map.putDouble(key, unwrapped.toDouble())
            is String -> map.putString(key, unwrapped)
            is Map<*, *> -> map.putMap(key, writableMap(unwrapped))
            is Iterable<*> -> map.putArray(key, writableArray(unwrapped))
            is Array<*> -> map.putArray(key, writableArray(unwrapped.asIterable()))
            else -> map.putString(key, unwrapped.toString())
        }
    }

    /** The array half of [putValue]. Same ordering, same recursion. */
    private fun pushValue(array: WritableArray, value: Any?) {
        when (val unwrapped = unwrapJson(value)) {
            null -> array.pushNull()
            is Boolean -> array.pushBoolean(unwrapped)
            is Int -> array.pushInt(unwrapped)
            is Double -> array.pushDouble(unwrapped)
            is Number -> array.pushDouble(unwrapped.toDouble())
            is String -> array.pushString(unwrapped)
            is Map<*, *> -> array.pushMap(writableMap(unwrapped))
            is Iterable<*> -> array.pushArray(writableArray(unwrapped))
            is Array<*> -> array.pushArray(writableArray(unwrapped.asIterable()))
            else -> array.pushString(unwrapped.toString())
        }
    }

    private fun writableMap(source: Map<*, *>): WritableMap =
        Arguments.createMap().apply {
            source.forEach { (k, v) -> putValue(this, k.toString(), v) }
        }

    private fun writableArray(source: Iterable<*>): WritableArray =
        Arguments.createArray().apply { source.forEach { pushValue(this, it) } }

    // ---------------------------------------------------------------------
    // Personalization
    // ---------------------------------------------------------------------

    /**
     * NOT conformant on Android, and the reason is worth stating precisely.
     *
     * The contract specifies `products(...) -> Result<[ProductRecommendation]>`
     * and intempt-swift returns exactly that. intempt-android 3.0 returns a raw
     * `kotlinx.serialization.json.JsonObject?` from the feed endpoint — a
     * different type, not merely a different name.
     *
     * The bridge could parse that JSON into the contract's shape, but only by
     * guessing at a payload structure nobody has probed, and a mapping invented
     * here would be wrong in a way TypeScript would then assert as true. A
     * precise rejection is better than a confident guess.
     *
     * Tracked as an Android conformance item; iOS is unaffected.
     */
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
        "intempt-android returns a raw JsonObject from the feed endpoint rather than the " +
            "contract's typed ProductRecommendation list. Mapping it here would mean inventing " +
            "a payload shape. iOS returns the contract type.",
    )

    // ---------------------------------------------------------------------
    // Automatic events
    // ---------------------------------------------------------------------

    @ReactMethod
    fun getAutomaticEvents(instanceName: String, promise: Promise) =
        withInstance(instanceName, "getAutomaticEvents", promise) { instance ->
            val options = instance.automaticEvents
            promise.resolve(
                Arguments.createMap().apply {
                    putBoolean("sessions", options.sessions)
                    putBoolean("versionChanges", options.versionChanges)
                    putBoolean("appStateChanges", options.appStateChanges)
                },
            )
        }

    @ReactMethod
    fun setAutomaticEvents(instanceName: String, options: ReadableMap, promise: Promise) =
        withInstance(instanceName, "setAutomaticEvents", promise) { instance ->
            // An absent key leaves that toggle alone. Defaulting a missing key to
            // false would silently disable session tracking for a caller who only
            // meant to change versionChanges.
            val current = instance.automaticEvents
            instance.automaticEvents = AutomaticEventsOptions(
                sessions = optBool(options, "sessions", current.sessions),
                versionChanges = optBool(options, "versionChanges", current.versionChanges),
                appStateChanges = optBool(options, "appStateChanges", current.appStateChanges),
            )
            promise.resolve(null)
        }

    // ---------------------------------------------------------------------
    // Autocapture
    // ---------------------------------------------------------------------

    @ReactMethod
    fun configureAutocapture(instanceName: String, options: ReadableMap, promise: Promise) =
        withInstance(instanceName, "autocapture.configure", promise) { instance ->
            val current = instance.autocapture.options
            // captureText is Android-only granularity and stays in the contract's
            // platform annex — the cross-platform surface is screenViews and
            // controlInteractions, so this preserves whatever it already was.
            instance.autocapture.configure(
                AutocaptureOptions(
                    screenViews = optBool(options, "screenViews", current.screenViews),
                    controlInteractions =
                        optBool(options, "controlInteractions", current.controlInteractions),
                    captureText = current.captureText,
                ),
            )
            promise.resolve(null)
        }

    @ReactMethod
    fun startAutocapture(instanceName: String, promise: Promise) =
        withInstance(instanceName, "autocapture.start", promise) {
            it.autocapture.start()
            promise.resolve(null)
        }

    @ReactMethod
    fun stopAutocapture(instanceName: String, promise: Promise) =
        withInstance(instanceName, "autocapture.stop", promise) {
            it.autocapture.stop()
            promise.resolve(null)
        }

    @ReactMethod
    fun isAutocaptureRunning(instanceName: String, promise: Promise) =
        withInstance(instanceName, "autocapture.isRunning", promise) {
            promise.resolve(it.autocapture.isRunning)
        }

    // ---------------------------------------------------------------------
    // Push — genuinely absent from intempt-android's public surface
    // ---------------------------------------------------------------------

    @ReactMethod
    fun setPushToken(instanceName: String, token: String, promise: Promise) =
        unsupported(
            promise,
            "setPushToken",
            "Registration happens inside FirebaseService and is not exposed. Android push " +
                "is wired through Firebase directly; see the SDK's push documentation.",
        )

    @ReactMethod
    fun trackPushOpen(instanceName: String, payload: ReadableMap, promise: Promise) =
        unsupported(promise, "trackPushOpen", "No public push API on intempt-android.")

    @ReactMethod
    fun trackPushReceived(instanceName: String, payload: ReadableMap, promise: Promise) =
        unsupported(promise, "trackPushReceived", "No public push API on intempt-android.")

    // ---------------------------------------------------------------------
    // Diagnostics
    // ---------------------------------------------------------------------

    @ReactMethod
    fun getSdkVersion(promise: Promise) {
        // Guarded because a consumer pinning intemptAndroidVersion back to 2.x
        // has no BuildConfig.sdkVersion field: the NoSuchFieldError would escape
        // the @ReactMethod as a native crash rather than a rejected promise.
        try {
            promise.resolve(com.intempt.core.BuildConfig.sdkVersion)
        } catch (e: Throwable) {
            promise.reject("unknown", e.message ?: "Intempt.getSdkVersion failed", e)
        }
    }

    private fun optBool(map: ReadableMap, key: String, fallback: Boolean): Boolean =
        if (map.hasKey(key)) map.getBoolean(key) else fallback

    companion object {
        const val NAME = "IntemptReactNative"

        /** src/index.ts FLAG_ERROR_EVENT; iOS sends the same name. */
        private const val FLAG_ERROR_EVENT = "IntemptFlagError"

        /** Long enough for a slow network round trip, short enough to surface a stuck queue. */
        private const val FLUSH_TIMEOUT_MS = 30_000L
    }
}
