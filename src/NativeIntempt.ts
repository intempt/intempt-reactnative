/**
 * TurboModule specification for the Intempt native module.
 *
 * React Native's codegen reads this file to generate the native interfaces, so
 * it is subject to codegen's type restrictions rather than TypeScript's full
 * expressiveness:
 *
 *   - `Object` where a structured map crosses; codegen has no generics
 *   - no enums, no unions, no optional-with-default
 *   - every method returns a Promise
 *
 * The richer types live in `types.ts` and are applied in `index.ts`, which is
 * the surface a caller actually touches. Keep this file boring.
 *
 * Every method takes `instanceName` explicitly. The native side holds the
 * instance registry; this layer is stateless, so the instance a call belongs to
 * has to travel with the call.
 */

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Lifecycle
  initialize(
    instanceName: string,
    apiKey: string,
    orgId: string,
    projectId: string,
    sourceId: string
  ): Promise<void>;

  // Capture — every one resolves to whether the event was queued
  track(instanceName: string, eventTitle: string, data: Object | null): Promise<boolean>;

  identify(
    instanceName: string,
    userId: string,
    eventTitle: string | null,
    userAttributes: Object | null,
    data: Object | null
  ): Promise<boolean>;

  group(
    instanceName: string,
    accountId: string,
    eventTitle: string | null,
    accountAttributes: Object | null
  ): Promise<boolean>;

  alias(instanceName: string, userId: string, anotherUserId: string): Promise<boolean>;

  record(
    instanceName: string,
    eventTitle: string,
    userId: string | null,
    accountId: string | null,
    data: Object | null,
    userAttributes: Object | null,
    accountAttributes: Object | null
  ): Promise<boolean>;

  // Commerce
  productAdd(instanceName: string, productId: string, quantity: number): Promise<boolean>;
  productView(instanceName: string, productId: string): Promise<boolean>;
  /** `products` is an array of `{productId, quantity}`. Codegen has no tuple type. */
  productOrdered(instanceName: string, products: Object[]): Promise<boolean>;

  // Consent
  consent(
    instanceName: string,
    action: string,
    validUntil: number,
    email: string | null,
    message: string | null,
    category: string | null
  ): Promise<boolean>;

  // Identity
  getProfileId(instanceName: string): Promise<string>;
  getSessionId(instanceName: string): Promise<string>;
  logOut(instanceName: string): Promise<void>;
  reset(instanceName: string): Promise<void>;

  // Opt in / out
  optIn(instanceName: string): Promise<void>;
  optOut(instanceName: string): Promise<void>;
  hasOptedOut(instanceName: string): Promise<boolean>;

  // Delivery
  /** Resolves to the number of events delivered. */
  flush(instanceName: string): Promise<number>;
  getFlushInterval(instanceName: string): Promise<number>;
  setFlushInterval(instanceName: string, seconds: number): Promise<void>;

  // Flags — a mobile SDK runs on a device and is still an `api`-channel consumer,
  // because there is no visual editor for a native surface: the value is authored
  // as a payload and the integrator writes the branch.
  /** Resolves to `{value}`. Never rejects for a service failure. */
  variation(
    instanceName: string,
    key: string,
    context: Object,
    defaultValue: Object
  ): Promise<Object>;
  allFlags(instanceName: string, context: Object): Promise<Object>;

  // Personalization — feeds.
  products(
    instanceName: string,
    feedId: string,
    count: number,
    fields: string[],
    productId: string | null
  ): Promise<Object[]>;

  // Automatic events
  getAutomaticEvents(instanceName: string): Promise<Object>;
  setAutomaticEvents(instanceName: string, options: Object): Promise<void>;

  // Autocapture — distinct from automatic events. This one hooks the view
  // layer, so it installs nothing until start() is called.
  configureAutocapture(instanceName: string, options: Object): Promise<void>;
  startAutocapture(instanceName: string): Promise<void>;
  stopAutocapture(instanceName: string): Promise<void>;
  isAutocaptureRunning(instanceName: string): Promise<boolean>;

  // Push
  setPushToken(instanceName: string, token: string): Promise<boolean>;
  trackPushOpen(instanceName: string, payload: Object): Promise<boolean>;
  trackPushReceived(instanceName: string, payload: Object): Promise<boolean>;

  // Diagnostics
  getSdkVersion(): Promise<string>;
}

// `get`, not `getEnforcing`: on a platform with no native module (react-native-web,
// react-native-windows/macos, anything that isn't Android or iOS) `getEnforcing` throws at
// IMPORT time — before init() runs, before the app can catch anything at a sensible boundary.
// Platform absence is not an exceptional state for a mobile-only SDK; it must surface the same
// way a method-level gap does: as a catchable `IntemptError` with `isUnsupported`, raised from
// the call site. `index.ts` owns that translation.
export default TurboModuleRegistry.get<Spec>('IntemptReactNative');
