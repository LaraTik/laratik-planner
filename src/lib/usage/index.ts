/**
 * M2.3 — usage-tracking module barrel.
 *
 * The public surface for the usage-tracking feature. M2.4's
 * quota-enforcement service imports `recordUsage` and
 * `getUsage` from here; the platform console (M2.5+) imports
 * the snapshot types for the dashboard render.
 *
 * The barrel is intentionally narrow: it re-exports the
 * documented types, Zod schemas, the two service functions,
 * and the pure `computeLevel` / `severityOf` helpers. The
 * internal helpers (`getLimitForResource` and the
 * per-day-dedupe SELECT in `record-usage.ts`) are NOT
 * exported — they are implementation details that the M2.2
 * entitlement-merge refactor will replace.
 */
export { recordUsage } from "./record-usage";
export { getUsage } from "./get-usage";
export { computeLevel, severityOf, THRESHOLD_LEVELS, InvalidUsageDeltaError } from "./threshold";
export { currentCounterValue, usagePeriodKey } from "./period";
export {
  KNOWN_RESOURCES,
  RESOURCE_TO_PLAN_KEY,
  ResourceKeySchema,
  UsageSnapshotSchema,
  UsageThresholdSnapshotSchema,
  type KnownResource,
  type ResourceKey,
  type UsageLevel,
  type UsageSnapshot,
  type UsageThresholdSnapshot,
} from "./types";
