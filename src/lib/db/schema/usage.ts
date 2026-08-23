import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { agencies } from "./identity";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §4 (Milestone 2) + M2.3 — per-agency
 * usage counters.
 *
 * M2.1 introduced the *threshold event* table that records when a
 * counter crossed 80% / 90% / 100% of its plan limit, but it left the
 * counter itself as a service-only concept. M2.3 promotes the counter
 * to a real table for three reasons:
 *
 *  1. **Per-row locking clarity.** "What's the current usage of
 *     `social_profiles:instagram` for agency X?" is the single hot
 *     query the quota-enforcement service (M2.4) issues on every
 *     allocation. A dedicated row keyed by `(agency_id, resource_key)`
 *     lets the service `SELECT … FOR UPDATE` the exact row it is
 *     about to mutate, so two concurrent "create Instagram profile"
 *     calls serialize on the same row instead of stomping on each
 *     other's counter.
 *
 *  2. **Auditable history-free current value.** The threshold event
 *     log records *crossings* (one row per level per resource), not
 *     the running tally. The platform console needs the live number
 *     ("you have 7 of 25 profiles") which is what this table holds.
 *
 *  3. **Decoupled from the entitlement table.** A change to the
 *     agency's plan (M2.2) is a *limit* change; a record-usage call
 *     is a *consumption* change. Keeping them in separate tables
 *     means a plan downgrade does not lock against counter
 *     increments.
 *
 * Resource naming convention (service-level, NOT a DB constraint):
 *
 *   - Total / aggregate resources use the base name: `workspaces`,
 *     `users`, `social_profiles`, `storage_bytes`, `ai_requests`,
 *     `ai_input_tokens`, `ai_output_tokens`,
 *     `daily_ai_requests:<user_id>`.
 *   - Per-platform resources use a colon-separated suffix:
 *     `social_profiles:instagram`, `social_profiles:tiktok`, etc.
 *     A `social_profiles:<platform>` counter is *independent* of
 *     the `social_profiles` total — both increment when a
 *     profile is created on that platform.
 *
 * Column semantics (see migration 0010 for the SQL DDL):
 *
 *   - `current_value`      : the running count. `bigint` so
 *     `storage_bytes` (terabyte-scale numbers) and AI token
 *     counts (a heavy agency can easily blow past 2^31) do not
 *     overflow. The `CHECK (current_value >= 0)` constraint is
 *     the last line of defense against an application bug that
 *     decrements past zero; the service layer throws
 *     `InvalidUsageDeltaError` *before* the SQL is issued, but
 *     a raw UPDATE that lands at -1 is rejected at the DB.
 *   - `last_recorded_at`   : the time the most recent usage event
 *     was recorded. Set to `now()` on every successful
 *     `recordUsage` call. Conceptually distinct from
 *     `last_updated_at`.
 *   - `last_updated_at`    : the time the row was last mutated
 *     (any UPSERT). Set to `now()` on every successful
 *     `recordUsage` call.
 *   - `version`            : optimistic-concurrency counter,
 *     incremented by 1 on every UPSERT. M2.4 will use it for
 *     compare-and-swap on `(agency_id, resource_key, version)`.
 *
 * FK behavior:
 *
 *   `agency_id` is `ON DELETE restrict` (not cascade) so the
 *   `agency` row's referential integrity is preserved if an admin
 *   tries to delete an agency that still has counters — the admin
 *   must explicitly clear counters (which the soft-archive flow
 *   does) before deletion is allowed. This mirrors the
 *   `agency_membership` relationship, where orphaning records
 *   is a violation the system wants to surface.
 */
export const agencyUsageCounters = pgTable(
  "agency_usage_counter",
  {
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    resourceKey: text("resource_key").notNull(),
    currentValue: bigint("current_value", { mode: "number" }).notNull().default(0),
    lastRecordedAt: timestamp("last_recorded_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    version: bigint("version", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    // The counter is uniquely identified by (agency_id, resource_key).
    // There is no surrogate id; the service layer addresses a
    // counter by its (agency, resource_key) pair.
    primaryKey({ columns: [t.agencyId, t.resourceKey] }),
    // The "all counters for one agency" lookup is the hot path
    // for getUsage(); the table is small (≤ 16 rows per agency
    // for the documented resource set) but the platform console
    // dashboard reads all of them on every page load, so the
    // single-column index keeps the query plan stable.
    index("agency_usage_counter_agency_idx").on(t.agencyId),
    // "Find one counter by (agency, resource_key)" — explicit
    // secondary index on the natural key. Mirrors the PK
    // columns; the planner will prefer this when the query is
    // selectivity-bound (M2.4's quota-enforcement read).
    index("agency_usage_counter_agency_resource_idx").on(t.agencyId, t.resourceKey),
    // The `current_value >= 0` invariant is the structural
    // safety net for application bugs that decrement past zero.
    // The service throws InvalidUsageDeltaError *before* the SQL
    // is issued, but a raw UPDATE that lands at -1 still has to
    // be rejected at the DB.
    check("agency_usage_counter_current_value_nonneg", sql`${t.currentValue} >= 0`),
  ],
);

// Re-export the inferred row types so service code can refer to
// them without re-deriving.
export type AgencyUsageCounter = typeof agencyUsageCounters.$inferSelect;
export type AgencyUsageCounterInsert = typeof agencyUsageCounters.$inferInsert;
