package com.intempt.reactnative

import com.intempt.core.types.Choice
import com.intempt.core.types.FlagDetail

/**
 * intempt-android's FlagDetail as the JS `FlagDetail`: reason in its wire spelling, error code by
 * name, optional fields left out rather than sent as null. iOS builds the same map in
 * TypeBridge.dictionary(from: FlagDetail); the two must not disagree.
 */
internal fun flagDetailFields(detail: FlagDetail): Map<String, Any?> =
    buildMap {
        put("value", detail.value)
        put("reason", detail.reason.wireValue)
        detail.errorCode?.let { put("errorCode", it.name) }
        detail.error?.let { error ->
            put("error", buildMap { put("kind", error.kind.wireName); error.status?.let { put("status", it) } })
        }
        detail.variationId?.let { put("variationId", it) }
        detail.valueType?.let { put("valueType", it) }
        detail.rule?.let { put("rule", it) }
        detail.variant?.let { put("variant", it) }
    }

internal fun choiceFields(choice: Choice): Map<String, Any?> =
    buildMap {
        put("name", choice.name)
        put("body", choice.body)
        choice.group?.let { put("group", it) }
        choice.experienceId?.let { put("experienceId", it) }
        choice.variantId?.let { put("variantId", it) }
        choice.reason?.let { put("reason", it) }
    }
