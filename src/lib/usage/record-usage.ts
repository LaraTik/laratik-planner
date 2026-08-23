import "server-only";
import { sql, eq, and, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { agencyUsageCounters, agencyUsageThresholdEvents } from "@/lib/db/schema";
import { getLimitForResource } from "./get-limit-for-resource";
import { computeLevel, severityOf, THRESHOLD_LEVELS } from "./threshold";
import {
  KNOWN_RESOURCES,
  RESOURCE_TO_PLAN_KEY,
  InvalidUsageDeltaError,
  type KnownResource,
  type UsageLevel,
} from "./types";

/**
 * M2.3 — `recordUsage(agencyId, resource, delta)`.
 *
 * The hot path of the usage-tracking service. Called by the
 * application layer every time a workspace is created, a user is
 * invited, an Instagram profile is connected, an AI request is
 * made, etc. The function:
 *
 *   1. UPSERTs the counter row in `agency_usage_counter` with
 *      the delta applied. The `ON CONFLICT` clause uses the
 *      `(agency_id, resource_key)` primary key; the `version`
 *      column is incremented by 1 on every write so M2.4's
 *      quota-enforcement can do a compare-and-swap.
 *   2. Validates the new value is `>= 0`. If the delta would
 *      have taken the counter below zero, the UPSERT is wrapped
 *      in a transaction that rolls back; `InvalidUsageDeltaError`
 *      is thrown to the caller.
 *   3. Reads the agency's effective limit for the resource
 *      (plan default + per-agency override). For M2.3 this is a
 *      local helper `getLimitForResource`; M2.2 will refactor to
 *      use the full merge function.
 *   4. Computes the new level with `computeLevel(value, limit)`.
 *   5. Emits threshold events for every level the counter has
 *      just crossed. The M2.1 unique index
 *      `(agency_id, resource, level)` is the final dedupe (it
 *      rejects a second insert at the same level ever); the
 *      service also implements the M2 spec's *per-day* dedupe
 *      by checking for an event for this resource + level that
 *      already exists in today's calendar window, and skipping
 *      the insert in that case. `INSERT … ON CONFLICT DO NOTHING`
 *      is the final safety net for a concurrent caller.
 *
 * The `db` parameter is the Drizzle client. Accepting it as a
 * parameter (instead of importing the singleton from
 * `@/lib/db`) makes the function testable: integration tests
 * pass a `Pool`-backed client; production callers pass the
 * app-wide singleton from `getDb()`.
 *
 * The function returns the *new* counter value so the caller
 * can include it in the response payload without a second
 * SELECT. A successful call is idempotent in the
 * "level-emission" sense (a second call that does not cross a
 * new level does not create a second event row).
 */
export async function recordUsage(
  db: NodePgDatabase,
  agencyId: string,
  resource: string,
  delta: number,
): Promise<number> {
  if (!Number.isFinite(delta) || !Number.isInteger(delta)) {
    // Defensive guard: a non-numeric delta is a programming bug,
    // not a runtime condition. Throwing keeps the contract
    // narrow (the function accepts integer numbers only).
    throw new Error(`recordUsage: delta must be a finite integer, got ${delta}`);
  }

  // The UPSERT + the threshold-event emission must be in the
  // same transaction so a concurrent caller cannot observe a
  // "counter went up but the event was lost" state. The
  // transaction is the smallest possible scope (one statement
  // for the UPSERT, one for the limit lookup, one for the
  // event insert) — we are not holding a write lock on the
  // counter row here; M2.4's quota-enforcement path uses
  // SELECT … FOR UPDATE to serialize the actual counter
  // increment.
  return db.transaction(async (tx) => {
    // 1) Read the current value (if any) so we can validate
    //    the floor BEFORE the UPSERT is applied. SELECT … FOR
    //    UPDATE serializes concurrent recordUsage calls on the
    //    same (agency_id, resource_key) row — M2.4's quota
    //    enforcement layer relies on this same pattern.
    const [existing] = await tx
      .select({ value: agencyUsageCounters.currentValue })
      .from(agencyUsageCounters)
      .where(
        and(
          eq(agencyUsageCounters.agencyId, agencyId),
          eq(agencyUsageCounters.resourceKey, resource),
        ),
      )
      .for("update");

    const currentValue = existing?.value ?? 0;
    const nextValue = currentValue + delta;
    if (nextValue < 0) {
      throw new InvalidUsageDeltaError(resource, currentValue, delta);
    }

    // 2) Apply the UPSERT. The `version` is incremented by 1
    //    on every write so M2.4 can use it for compare-and-swap
    //    in the quota-enforcement path. The `last_recorded_at`
    //    and `last_updated_at` are both set to `now()` on a
    //    successful call. We do not use a single `INSERT … ON
    //    CONFLICT` here because the `version` increment must
    //    be relative to the *current* version (a raw
    //    `value = value + delta` would clobber concurrent
    //    updates).
    const now = new Date();
    if (existing) {
      await tx
        .update(agencyUsageCounters)
        .set({
          currentValue: nextValue,
          lastRecordedAt: now,
          lastUpdatedAt: now,
          version: sql`${agencyUsageCounters.version} + 1`,
        })
        .where(
          and(
            eq(agencyUsageCounters.agencyId, agencyId),
            eq(agencyUsageCounters.resourceKey, resource),
          ),
        );
    } else {
      await tx.insert(agencyUsageCounters).values({
        agencyId,
        resourceKey: resource,
        currentValue: nextValue,
        lastRecordedAt: now,
        lastUpdatedAt: now,
        version: 1,
      });
    }

    // 3) Compute the new level. If the resource has no limit
    //    configured (agency is on the "custom" plan with no
    //    override, or the resource is a per-user one not
    //    covered by the plan defaults), the level is always
    //    healthy and no event is emitted.
    const limit = await getLimitForResource(tx, agencyId, resource);
    const newLevel = computeLevel(nextValue, limit);

    // 4) Emit threshold events for the levels the counter has
    //    just crossed. The M2 spec is per-day dedupe: an
    //    event for (agency, resource, level) already emitted
    //    today is skipped. The M2.1 unique index
    //    (agency_id, resource, level) is the final hard
    //    dedupe — even if the per-day check is bypassed
    //    (clock skew, etc.) the INSERT … ON CONFLICT DO
    //    NOTHING makes the call idempotent.
    if (newLevel !== "healthy") {
      const cycleKey = new Date().toISOString().slice(0, 10);
      const highestExisting = await getHighestRecordedLevel(tx, agencyId, resource, cycleKey);
      // The set of levels to emit is the set of levels
      // strictly more severe than `highestExisting` and at
      // most as severe as `newLevel`. The levels between
      // highestExisting (exclusive) and newLevel (inclusive)
      // are the ones to insert.
      const highestSeverity = severityOf(highestExisting);
      const newSeverity = severityOf(newLevel);
      for (let s = highestSeverity + 1; s <= newSeverity; s += 1) {
        const level = THRESHOLD_LEVELS[s - 1];
        if (!level) continue;
        // Per-day dedupe check: skip if an event for
        // (agency, resource, level) already exists in the
        // current calendar day. The M2.1 unique index is
        // global; the per-day check makes the "no
        // duplicate within a day" semantic explicit in the
        // application code.
        const percent = limit === null || limit === 0 ? null : (nextValue / limit) * 100;
        await tx
          .insert(agencyUsageThresholdEvents)
          .values({
            agencyId,
            resource,
            level,
            cycleKey,
            percent: percent == null ? "0" : percent.toFixed(2),
          })
          .onConflictDoNothing({
            target: [
              agencyUsageThresholdEvents.agencyId,
              agencyUsageThresholdEvents.resource,
              agencyUsageThresholdEvents.level,
              agencyUsageThresholdEvents.cycleKey,
            ],
          });
      }
    }

    return nextValue;
  });
}

/**
 * Look up the most-severe level the agency has already
 * recorded for a resource. Used to decide whether a new
 * `recordUsage` call should emit a new event (only when
 * the new level is more severe than what is already on
 * the books).
 *
 * Implementation note: we read ALL levels (warning,
 * urgent, over_limit) in one query and pick the most
 * severe. The M2.1 unique index `(agency_id, resource,
 * level)` guarantees at most one row per level, so the
 * set is bounded at 3 rows.
 */
async function getHighestRecordedLevel(
  db: NodePgDatabase,
  agencyId: string,
  resource: string,
  cycleKey: string,
): Promise<UsageLevel> {
  const rows = await db
    .select({ level: agencyUsageThresholdEvents.level })
    .from(agencyUsageThresholdEvents)
    .where(
      and(
        eq(agencyUsageThresholdEvents.agencyId, agencyId),
        eq(agencyUsageThresholdEvents.resource, resource),
        eq(agencyUsageThresholdEvents.cycleKey, cycleKey),
      ),
    );
  if (rows.length === 0) return "healthy";
  let highest: UsageLevel = "healthy";
  for (const r of rows) {
    if (r.level === "warning" || r.level === "urgent" || r.level === "over_limit") {
      if (severityOf(r.level) > severityOf(highest)) {
        highest = r.level;
      }
    }
  }
  return highest;
}

// Re-export the resource catalog and type so a caller
// that imports `recordUsage` from this module can also
// access the documented resource names without a second
// import line.
export { KNOWN_RESOURCES, type KnownResource, type UsageLevel };
export { sql, inArray };
export { RESOURCE_TO_PLAN_KEY, InvalidUsageDeltaError };
