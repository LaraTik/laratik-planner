import { sql } from "drizzle-orm";
import {
  check,
  index,
  inet,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { archivedAt, idColumn, jsonb, jsonbNullable, timestamps } from "./_helpers";
import { agencyEntitlementGracePolicyEnum, agencyUsageThresholdLevelEnum } from "./enums";
import { agencies, users } from "./identity";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §4 (Milestone 2) + docs/m2-multi-agency/PLAN.md
 * (M2.1) — Plans, entitlements, usage threshold events, and the
 * platform-level audit log.
 *
 * Design notes:
 *
 * 1. `platform_plan_template` carries the **default** limits for a plan
 *    tier (Starter / Growth / Enterprise / Custom). Custom is a sentinel
 *    that means "no defaults; an agency on this plan must override every
 *    limit at entitlement time." Per M2.1, Custom is the only plan where
 *    `default_limits` is allowed to be NULL — for the seeded tiers it
 *    must include the documented shape.
 *
 * 2. `agency_entitlement` is the per-agency row that picks a plan and
 *    applies JSONB overrides on top. The service layer (M2.2) is
 *    responsible for merging defaults + overrides; the schema is just
 *    the persistence contract. `overrides` is nullable so an agency
 *    that uses the plan defaults pays nothing in storage and the
 *    "override is partial" semantics is well-defined (missing key =
 *    use plan default, present key = override the plan).
 *
 * 3. `agency_entitlement_change` is the **append-only** audit log for
 *    every entitlement mutation. UPDATE and DELETE are forbidden by a
 *    BEFORE-UPDATE / BEFORE-DELETE trigger installed in migration 0009.
 *    The pattern matches the production guideline in §8: "audit events
 *    are immutable". The trigger RAISEs an exception; the app must
 *    NEVER try to mutate these rows.
 *
 * 4. `agency_usage_threshold_event` is emitted by the usage-tracking
 *    service (M2.3) whenever a counter crosses a threshold (80% /
 *    90% / 100%). The `UNIQUE (agency_id, resource, level)` constraint
 *    is the dedupe mechanism — a second emission at the same level is
 *    a no-op, but the row that already exists stays. Going back below
 *    the threshold and crossing again is a separate decision for M2.3
 *    to make; the schema simply records the first crossing.
 *
 * 5. `platform_audit_event` is the **platform-level** audit log — every
 *    action taken by a platform admin (lifecycle changes, plan
 *    changes, agency creation, etc.) lands here. The per-agency /
 *    per-workspace audit (existing `activity_event` table) is
 *    unaffected. Like `agency_entitlement_change`, this table is
 *    append-only via a trigger.
 *
 * FK behavior:
 *
 * - `agency_entitlement.agency_id` is also the PRIMARY KEY of
 *   `agency_entitlement`, so the relationship is one-to-one. We
 *   `ON DELETE CASCADE` so removing an agency cleans up its
 *   entitlement. The entitlement row is meaningless without the
 *   agency, so cascade is the right semantic here (compare to
 *   `agency_membership`, which is `ON DELETE RESTRICT` because
 *   orphaning members is a violation the system wants to surface).
 *
 * - `agency_entitlement_change.agency_id` is `ON DELETE CASCADE` —
 *   audit rows have no value after the agency is gone. M2.2's
 *   transactional service is responsible for snapshotting what it
 *   needs to keep before any deletion, so this is a safety net, not
 *   a primary archival path.
 *
 * - `agency_usage_threshold_event.agency_id` is `ON DELETE CASCADE`
 *   for the same reason.
 *
 * - `platform_audit_event.actor_user_id` and
 *   `agency_entitlement_change.actor_user_id` are `ON DELETE SET
 *   NULL` because the audit log must survive user deletion (the
 *   "actor" attribute is descriptive, not authoritative). A user
 *   that is hard-deleted leaves the audit row intact with a NULL
 *   actor — the platform admin can still see "a plan was changed"
 *   even when the changer's account is gone.
 *
 * JSONB shape contract (M2.2 reads this — keep stable):
 *
 *   default_limits := {
 *     workspaces: int | null,
 *     users: int | null,
 *     total_social_profiles: int | null,
 *     social_profiles_per_platform: int | null,
 *     storage_bytes: bigint | null,
 *     monthly_ai_requests: int | null,
 *     monthly_ai_input_tokens: int | null,
 *     monthly_ai_output_tokens: int | null,
 *     daily_ai_requests_per_user: int | null,
 *     max_output_tokens_per_request: int | null,
 *     enabled_capabilities: string[] | null,
 *   }
 *
 *   overrides := { ...same keys, all optional }
 */

// ─── platform_plan_template ────────────────────────────────────────────────
/**
 * The 4 seeded plan tiers are written by migration 0009. New tiers can
 * be added by an operator with INSERT privilege on the table; the
 * platform console (M2.7+) does NOT create plan templates in v1
 * (PLAN.md scope). `slug` is the human-readable stable identifier
 * (used in URLs and audit messages) and is unique among non-archived
 * rows. `name` is the display label shown in the platform console.
 */
export const platformPlanTemplates = pgTable(
  "platform_plan_template",
  {
    id: idColumn(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * The full set of defaults. NULL only for the "custom" sentinel —
     * a plan with no defaults forces the agency to override every
     * limit at entitlement time. The service layer is responsible for
     * not crashing on a NULL here.
     */
    defaultLimits: jsonbNullable("default_limits"),
    archivedAt: archivedAt(),
    ...timestamps,
  },
  (t) => [
    // `slug` is unique among non-archived rows so a soft-archived
    // template keeps its slug for the audit history without
    // colliding with a future replacement. The partial unique index
    // is also what lets the platform console safely re-issue the
    // same slug after a restore.
    uniqueIndex("platform_plan_template_slug_unique")
      .on(t.slug)
      .where(sql`archived_at IS NULL`),
    index("platform_plan_template_archived_at_idx").on(t.archivedAt),
  ],
);

// ─── agency_entitlement ────────────────────────────────────────────────────
/**
 * One row per agency. The PK is `agency_id` so the relationship is
 * strictly one-to-one (a cleaner alternative to a synthetic ID for
 * this cardinality). `plan_template_id` is NOT NULL — every agency
 * must point at a plan template. "Custom" is the sentinel for
 * "no defaults; agency must override everything".
 *
 * `overrides` is nullable. The merge contract (M2.2):
 *   - present key in `overrides`  → that value wins
 *   - missing key in `overrides`   → fall through to plan default
 *   - missing key in plan default  → "no limit" (caller decides)
 *
 * `hard_stop_percent` is the percentage of any limit at which the
 * service-layer enforcement (M2.4) starts rejecting new allocations.
 * 100 = enforce exactly at the limit; 110 = allow 10% over.
 * `grace_policy` overrides the plan's behavior: `block` (default)
 * raises `LimitExceededError`; `allow_grace` lets the operation
 * succeed and lets M2.3 emit a `over_limit` threshold event instead.
 */
export const agencyEntitlements = pgTable(
  "agency_entitlement",
  {
    agencyId: uuid("agency_id")
      .primaryKey()
      .references(() => agencies.id, { onDelete: "cascade" }),
    planTemplateId: uuid("plan_template_id")
      .notNull()
      .references(() => platformPlanTemplates.id, { onDelete: "restrict" }),
    overrides: jsonbNullable("overrides"),
    /**
     * 0..100. The numeric type preserves fractional values (e.g.
     * "stop at 95%") without losing precision. The CHECK constraint
     * matches the master prompt's "hard stop is a percent" wording.
     */
    hardStopPercent: numeric("hard_stop_percent", { precision: 5, scale: 2 })
      .notNull()
      .default("100"),
    gracePolicy: agencyEntitlementGracePolicyEnum("grace_policy"),
    effectiveSince: timestamp("effective_since", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    ...timestamps,
  },
  (t) => [
    check("agency_entitlement_hard_stop_range", sql`${t.hardStopPercent} >= 0`),
    check("agency_entitlement_hard_stop_max", sql`${t.hardStopPercent} <= 100`),
    // FK lookup is hot (every plan-change / usage query joins here),
    // so index the FK even though the PK is on the other column.
    index("agency_entitlement_plan_template_idx").on(t.planTemplateId),
  ],
);

// ─── agency_entitlement_change (APPEND-ONLY) ───────────────────────────────
/**
 * Audit log of every mutation to `agency_entitlement`. The BEFORE
 * UPDATE and BEFORE DELETE triggers installed by migration 0009 RAISE
 * an exception, making this table append-only at the DB level. The
 * Drizzle schema intentionally does not export any `update` / `delete`
 * helper — only `insert` and `select`.
 *
 * `before` and `after` are full snapshots of the entitlement row
 * (including `overrides`, `hard_stop_percent`, `grace_policy`,
 * `plan_template_id`, `effective_since`). The service layer
 * serializes them at the start of the transaction; the JSONB shape
 * mirrors the entitlement column types so M2.2 can replay a change
 * without needing the original Postgres row.
 *
 * `actor_user_id` is NULL for system-driven changes (e.g. the
 * scheduled downgrade after a `hard_stop_percent` breach). For
 * human-driven changes, the actor is the platform admin who pressed
 * the button. SET NULL on user deletion preserves the audit row.
 */
export const agencyEntitlementChanges = pgTable(
  "agency_entitlement_change",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /**
     * Nullable so system-driven changes (e.g. the scheduled
     * downgrade after a `hard_stop_percent` breach) can write a
     * row without a human actor.
     *
     * `ON DELETE RESTRICT` (not SET NULL) because the append-only
     * trigger forbids UPDATE on this table — a SET NULL cascade
     * would have to UPDATE the row, which the trigger blocks. The
     * practical consequence is that a `user` row that has ever
     * appeared as an actor in an entitlement change cannot be
     * hard-deleted. The application never hard-deletes users (M1's
     * user lifecycle is soft via `agency_membership.status`), so
     * this is a theoretical constraint, but the right semantic
     * anyway: the audit log outlives the actor.
     */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    before: jsonb("before"),
    after: jsonb("after"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("agency_entitlement_change_agency_idx").on(t.agencyId, sql`${t.createdAt} DESC`),
    index("agency_entitlement_change_actor_idx").on(t.actorUserId, sql`${t.createdAt} DESC`),
  ],
);

// ─── agency_usage_threshold_event ─────────────────────────────────────────
/**
 * Emitted by the usage-tracking service (M2.3) when a counter crosses
 * a threshold (80% / 90% / 100%). The UNIQUE constraint on
 * (agency_id, resource, level) is the dedupe mechanism: a second
 * emission at the same level is a no-op (the ON CONFLICT clause in
 * the service handles it), and the first emission is preserved for
 * the lifetime of the agency.
 *
 * `resource` is a free-text identifier. Conventional values are:
 *   - `workspaces`
 *   - `users`
 *   - `total_social_profiles`
 *   - `social_profiles:instagram` (per-platform keys)
 *   - `storage_bytes`
 *   - `monthly_ai_requests`
 *   - `monthly_ai_input_tokens`
 *   - `monthly_ai_output_tokens`
 *   - `daily_ai_requests_per_user:<user_id>` (per-user scoped)
 *
 * `percent` is the observed value at emission time. The CHECK
 * constraint is `>= 0` rather than `0..100` because "over_limit"
 * legitimately can exceed 100 (a 110% observation is what triggered
 * the event in the first place).
 */
export const agencyUsageThresholdEvents = pgTable(
  "agency_usage_threshold_event",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    resource: text("resource").notNull(),
    cycleKey: text("cycle_key")
      .notNull()
      .default(sql`CURRENT_DATE::text`),
    percent: numeric("percent", { precision: 7, scale: 2 }).notNull(),
    level: agencyUsageThresholdLevelEnum("level").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    // Dedupe: the (agency, resource, level) triple is unique. A second
    // emission at the same level is rejected so the alert channel
    // does not flood.
    uniqueIndex("agency_usage_threshold_event_dedupe_idx").on(
      t.agencyId,
      t.resource,
      t.level,
      t.cycleKey,
    ),
    // "Latest observation per resource" — the platform console
    // shows the most recent event for each resource.
    index("agency_usage_threshold_event_agency_resource_idx").on(
      t.agencyId,
      t.resource,
      sql`${t.observedAt} DESC`,
    ),
    check("agency_usage_threshold_event_percent_nonneg", sql`${t.percent} >= 0`),
  ],
);

// ─── platform_audit_event (APPEND-ONLY) ────────────────────────────────────
/**
 * Platform-level audit log. The BEFORE UPDATE and BEFORE DELETE
 * triggers installed by migration 0009 make this table append-only
 * at the DB level. Used by:
 *   - the platform console (M2.7+) to show "who did what" for an
 *     agency,
 *   - the support tooling (Milestone 3) for incident reconstruction,
 *   - the export pipeline (Milestone 4) for compliance evidence.
 *
 * `target` is a JSONB shape of `{ "type": "...", "id": "..." }`. The
 * service layer enforces a controlled vocabulary for `type`:
 *   - "agency"          → target.id is agency_id
 *   - "plan_template"   → target.id is platform_plan_template.id
 *   - "entitlement"     → target.id is agency_id
 *   - "lifecycle"       → target.id is agency_id
 *
 * `before` and `after` are full snapshots of the target at the time
 * of the action. NULL is permitted for actions that have no
 * meaningful before/after (e.g. a "viewed" event, an "export
 * generated" event). `ip` and `user_agent` capture the request
 * context; both are nullable because system-initiated actions have
 * no HTTP request.
 */
export const platformAuditEvents = pgTable(
  "platform_audit_event",
  {
    id: idColumn(),
    /**
     * `ON DELETE RESTRICT` (not SET NULL) for the same reason as
     * `agency_entitlement_change.actorUserId`: the append-only
     * trigger forbids UPDATE on this table, so a SET NULL cascade
     * (which is an UPDATE) would be rejected. RESTRICT means a
     * `user` row that has ever appeared as a platform-audit actor
     * cannot be hard-deleted. The application never hard-deletes
     * users; the constraint is theoretical but matches the
     * "audit log outlives the actor" intent.
     *
     * For system-initiated events (no human actor) the service
     * layer uses `actor_user_id: null` and the column accepts it.
     */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    target: jsonb("target").notNull(),
    before: jsonbNullable("before"),
    after: jsonbNullable("after"),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("platform_audit_event_actor_idx").on(t.actorUserId, sql`${t.createdAt} DESC`),
    index("platform_audit_event_action_idx").on(t.action, sql`${t.createdAt} DESC`),
    // "Latest events for a target" — the platform console's per-agency
    // timeline uses this index.
    index("platform_audit_event_target_idx").on(
      sql`(${t.target} ->> 'type')`,
      sql`(${t.target} ->> 'id')`,
      sql`${t.createdAt} DESC`,
    ),
  ],
);
