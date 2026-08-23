/**
 * M2.3 — threshold classification + dedupe.
 *
 * `computeLevel(value, limit)` is the pure function that turns a
 * (current value, effective limit) pair into one of the four
 * documented usage levels. It is the single source of truth for
 * the threshold boundaries (80% / 90% / 100%) and the unlimited /
 * zero-limit edge cases. The function is deliberately pure (no
 * DB, no clock, no logging) so it is trivially unit-testable and
 * reusable by both the record-usage path (to decide whether to
 * emit an event) and the get-usage path (to derive a level when
 * no event has been emitted yet).
 *
 * `THRESHOLD_LEVELS` is the ordered array of event levels the
 * service can emit (matches the M2.1
 * `agency_usage_threshold_level` Postgres enum minus the
 * `healthy` sentinel).
 *
 * Boundary semantics (the M2 spec):
 *
 *   - value < 80% of limit   → 'healthy'
 *   - value ≥ 80% of limit   → 'warning'
 *   - value ≥ 90% of limit   → 'urgent'
 *   - value ≥ 100% of limit  → 'over_limit'
 *
 * Edge cases:
 *   - `limit === null`       → 'healthy' (unlimited, no level)
 *   - `limit === 0` and
 *     `value === 0`          → 'healthy' (0/0 is not a violation)
 *   - `limit === 0` and
 *     `value > 0`            → 'over_limit' (any usage against a
 *                                    0-byte / 0-quota limit is a
 *                                    violation)
 *
 * The function is exported separately from `./types` so callers
 * that only need the math (e.g. a future M2.4 quota-enforcement
 * check that wants the *current* level without going to the DB)
 * can import it without pulling the rest of the usage module
 * surface.
 */
import { InvalidUsageDeltaError, type UsageLevel } from "./types";

/**
 * The three threshold levels the service can emit. The M2.1
 * Postgres enum `agency_usage_threshold_level` has the exact
 * same three values; this constant is the M2.3-side mirror so
 * the record-usage emission loop can iterate the levels in
 * order without re-deriving the list.
 */
export const THRESHOLD_LEVELS = ["warning", "urgent", "over_limit"] as const;
export type ThresholdLevel = (typeof THRESHOLD_LEVELS)[number];

/**
 * Numeric severity of each level. Used by `recordUsage` to
 * decide whether a new level is "more severe" than the highest
 * already-recorded one. The ordering is the documented M2
 * severity: warning < urgent < over_limit.
 */
const SEVERITY: Record<UsageLevel, number> = {
  healthy: 0,
  warning: 1,
  urgent: 2,
  over_limit: 3,
};

export function severityOf(level: UsageLevel): number {
  return SEVERITY[level];
}

/**
 * Classify a (value, limit) pair into a `UsageLevel`.
 *
 * The implementation uses floating-point division because all
 * limits in the M2.1 plan seed are `number`-sized (`bigint` is
 * reserved for the counter `current_value` column, where the
 * storage bytes can exceed `Number.MAX_SAFE_INTEGER` in
 * pathological cases — but that is handled by Drizzle's bigint
 * mode at the storage layer, not by this function). The
 * threshold gates are integer percentages (80 / 90 / 100); the
 * percent itself is stored in the database as `numeric(7, 2)`
 * and passed around as a number, so the floating-point boundary
 * checks are exact for the documented limit sizes.
 */
export function computeLevel(value: number, limit: number | null): UsageLevel {
  // An unlimited resource never reaches a threshold.
  if (limit === null) {
    return "healthy";
  }

  // The 0-limit edge case: 0/0 is "nothing used, nothing
  // allowed" which is a legal degenerate state for a
  // freshly-provisioned agency whose plan is not yet bound.
  // 1/0 (or higher) is a violation.
  if (limit === 0) {
    return value > 0 ? "over_limit" : "healthy";
  }

  // The percent is computed as a fraction (0..N) and compared
  // to the documented thresholds (80 / 90 / 100). The `<` vs
  // `<=` boundary is the M2 spec:
  //   - value >= 80% of limit → warning (so 80% is the FIRST
  //     warning observation)
  //   - value >= 90% of limit → urgent
  //   - value >= 100% of limit → over_limit
  // The function returns the *most severe* applicable level.
  const percent = (value / limit) * 100;
  if (percent >= 100) return "over_limit";
  if (percent >= 90) return "urgent";
  if (percent >= 80) return "warning";
  return "healthy";
}

// Re-export `InvalidUsageDeltaError` and `UsageLevel` from this
// module too so callers that import from `@/lib/usage/threshold`
// (the canonical "math + errors" surface) do not need a separate
// import line.
export { InvalidUsageDeltaError, type UsageLevel };
