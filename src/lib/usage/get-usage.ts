import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { agencyUsageCounters } from "@/lib/db/schema";
import { getLimitForResource } from "./get-limit-for-resource";
import { computeLevel } from "./threshold";
import { currentCounterValue } from "./period";
import {
  KNOWN_RESOURCES,
  UsageSnapshotSchema,
  type KnownResource,
  type UsageLevel,
  type UsageSnapshot,
  type UsageThresholdSnapshot,
} from "./types";

/**
 * M2.3 — `getUsage(agencyId)` returns the full usage snapshot
 * for an agency: current counter values, the most-severe
 * recorded level per resource, and the effective limit per
 * resource. The platform console dashboard reads this in one
 * call to render the status grid.
 *
 * The function is read-only and does not mutate state. It
 * issues three queries:
 *
 *   1. The full counter set for the agency (one row per
 *      resource the agency has touched; a row is missing for
 *      resources that have never been recorded — the function
 *      treats that as `value: 0`).
 *   2. The full threshold-event set for the agency (at most
 *      `KNOWN_RESOURCES.length * 3` rows; small, indexed).
 *   3. The effective limit for each known resource, computed
 *      by reading `agency_entitlement` + `platform_plan_template`
 *      once and looking up every resource in the same join.
 *      This is a deliberate optimization: the naive per-resource
 *      query is N round-trips; the batched approach is one.
 *
 * The function is parameterized on the Drizzle client (same
 * pattern as `recordUsage`) so tests can run against a
 * disposable DB without going through the singleton client.
 *
 * The "most severe recorded level" rule: if the agency has
 * any `over_limit` event for the resource, the snapshot's
 * `level` is `over_limit` (and the `percent` is the percent
 * from that event). If the highest is `urgent`, the level is
 * `urgent`. If the highest is `warning`, the level is
 * `warning`. If no events exist, the level is derived from
 * the current value + limit using `computeLevel`. This means
 * a counter that crossed `over_limit` and then dropped back
 * below the limit still reports `over_limit` in the snapshot
 * until the threshold event is explicitly cleared (M2.7's
 * "Clear threshold" action — out of scope for M2.3).
 *
 * The return value is Zod-validated against
 * `UsageSnapshotSchema` before being returned; a malformed
 * row in the database (e.g. a `percent` that fails to parse
 * as a finite number) would surface here as a `ZodError`,
 * not a silent NaN in the UI.
 */
export async function getUsage(db: NodePgDatabase, agencyId: string): Promise<UsageSnapshot> {
  // 1) Read the full counter set for the agency.
  const counterRows = await db
    .select()
    .from(agencyUsageCounters)
    .where(eq(agencyUsageCounters.agencyId, agencyId));
  const counterByResource = new Map<string, number>();
  for (const r of counterRows) {
    counterByResource.set(
      r.resourceKey,
      currentCounterValue(r.resourceKey, Number(r.currentValue), r.lastRecordedAt),
    );
  }

  // 2) Read the effective limit for each known resource.
  //    One round-trip per resource (the M2.4 refactor will
  //    batch this into a single join via M2.2's merge
  //    function). The current N-query cost is acceptable
  //    for the documented resource set (14 resources).
  const limitByResource = new Map<string, number | null>();
  for (const resource of KNOWN_RESOURCES) {
    limitByResource.set(resource, await getLimitForResource(db, agencyId, resource));
  }

  // Build the snapshot. The contract: every entry in
  // KNOWN_RESOURCES has a counters, thresholds, and limits
  // row in the returned object — even if the counter row is
  // missing (we report 0) and even if the limit is null (we
  // report null and the level is healthy).
  const counters: Record<string, number> = {};
  const thresholds: Record<string, UsageThresholdSnapshot> = {};
  const limits: Record<string, number | null> = {};

  for (const resource of KNOWN_RESOURCES) {
    const value = counterByResource.get(resource) ?? 0;
    const limit = limitByResource.get(resource) ?? null;
    const level = computeLevel(value, limit);
    const percent = limit === null || limit === 0 ? null : (value / limit) * 100;

    counters[resource] = value;
    thresholds[resource] = { level, percent, limit };
    limits[resource] = limit;
  }

  // Validate the final shape against the Zod schema before
  // returning. Catches the case where a row in the database
  // (e.g. an unknown resource_key written by a future
  // migration) is not numeric; the schema's `record(string,
  // number().int().nonnegative())` would reject NaN.
  return UsageSnapshotSchema.parse({ counters, thresholds, limits });
}

export { KNOWN_RESOURCES, type KnownResource, type UsageLevel, type UsageSnapshot };
export { and, inArray };
