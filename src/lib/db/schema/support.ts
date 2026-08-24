import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  inet,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, jsonbNullable, timestamps } from "./_helpers";
import { agencies } from "./identity";
import { users } from "./identity";
import { workspaces } from "./workspaces";

/**
 * Milestone 3 — Ticketed, approved, time-limited support access.
 *
 * Per master prompt §4 (Milestone 3):
 *
 *   "Implement a ticketed support-access workflow instead of
 *   impersonation. A request must contain: Reference ticket, Reason,
 *   Target agency, Exact workspace or metadata-only scope, Requested
 *   duration, Whether download/export is requested."
 *
 * Three tables land here:
 *
 *   1. supportAccessRequests        — the platform admin's pending
 *      ask. Contains ticket reference, reason, target, scope, and
 *      duration. Status transitions: pending → approved | rejected
 *      | cancelled | expired. An approved request produces exactly
 *      one supportAccessGrants row.
 *   2. supportAccessGrants          — the time-limited authorisation
 *      that unlocks a specific scope for a specific platform
 *      administrator. Default duration is short (the application
 *      layer enforces a recommended 2h cap and rejects anything
 *      beyond 7d). Downloads are off by default. Grants can be
 *      revoked at any time and expire automatically.
 *   3. supportAccessAudit           — append-only audit of every
 *      object a platform administrator viewed through an active
 *      grant. Records actor, target, action, outcome, IP, and
 *      user-agent. Forbids UPDATE / DELETE via a trigger (same
 *      pattern as `agencyEntitlementChanges` and
 *      `platformAuditEvents`).
 *
 * In addition, the AI daily budget tracking table
 * (`aiDailyBudgetUsage`) is added here because the M3 spec ties it
 * to the agency-level AI capability ceiling (per-user daily
 * requests, reconciled in the same transaction as the monthly
 * reservation).
 *
 * Notes on FK behaviour:
 *
 *   - `supportAccessGrant.approvedByUserId` and
 *     `supportAccessGrant.grantedToUserId` are `ON DELETE RESTRICT`
 *     because the audit log must survive user deletion but the
 *     grant must not outlive the parties that hold it. The
 *     application never hard-deletes users (the user lifecycle is
 *     soft via `agencyMembership.status`), so this is a
 *     theoretical safety net, not a primary archival path.
 *   - `supportAccessRequest.requestedByUserId` is `ON DELETE SET
 *     NULL` because the request audit value ("who asked") is
 *     descriptive rather than authoritative; an absent actor is
 *     preferable to a cascade that orphans a request.
 *   - `supportAccessAudit.actorUserId` is `ON DELETE SET NULL`
 *     for the same reason.
 *
 * The status field on the request and the grant is a free-text
 * column. The service layer enforces a controlled vocabulary; the
 * database does NOT use a Postgres enum so the vocabulary can grow
 * without an offline migration. The check constraint on
 * `supportAccessRequest.status` is the DB-level guard.
 */

export const supportAccessRequestStatusEnumValues = [
  "pending",
  "approved",
  "rejected",
  "cancelled",
  "expired",
] as const;
export type SupportAccessRequestStatus = (typeof supportAccessRequestStatusEnumValues)[number];

// ─── supportAccessRequests ─────────────────────────────────────────────────
/**
 * The platform administrator's pending ask. One row per ticket.
 * The `ticketReference` is the unique identifier from the
 * downstream ticketing system (Zendesk, Intercom, Linear, etc.);
 * the application's `id` is the internal correlation key.
 */
export const supportAccessRequests = pgTable(
  "support_access_request",
  {
    id: idColumn(),
    /** Unique reference into the external ticketing system. */
    ticketReference: text("ticket_reference").notNull(),
    /** Human-readable reason; written into the audit log verbatim. */
    reason: text("reason").notNull(),
    /** The agency whose content is being requested. */
    targetAgencyId: uuid("target_agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /**
     * Optional narrower scope. NULL means "agency-wide
     * (metadata-only or content, depending on the
     * `scopeMetadataOnly` flag)"; non-NULL pins the request to
     * a single workspace.
     */
    scopeWorkspaceId: uuid("scope_workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    /**
     * When true, the grant (if approved) only unlocks
     * metadata: agency list, plan, AI usage, audit log. The
     * platform administrator must explicitly request content
     * access (i.e. `scopeMetadataOnly = false`).
     */
    scopeMetadataOnly: boolean("scope_metadata_only").notNull().default(false),
    /**
     * Requested duration in hours. The application layer
     * rejects anything > 168 (one week). The DB-level check
     * constraint matches the same bound.
     */
    requestedDurationHours: integer("requested_duration_hours").notNull(),
    /**
     * Whether the platform admin needs to download or export
     * tenant content. Always off by default; agencies can
     * explicitly grant it as a per-request override but the
     * `supportAccessGrants.downloadsAllowed` column records the
     * final decision.
     */
    downloadsRequested: boolean("downloads_requested").notNull().default(false),
    /**
     * Status vocabulary:
     *   - `pending`    — waiting for an agency admin decision.
     *   - `approved`   — agency admin approved; a grant row
     *                    exists. The grant may not yet have
     *                    started if `activated_at` is in the
     *                    future (M3 leaves that to the service
     *                    layer — we activate on approval).
     *   - `rejected`   — agency admin rejected; no grant.
     *   - `cancelled`  — platform admin cancelled before a
     *                    decision landed.
     *   - `expired`    — never decided within the platform's
     *                    SLA. The application auto-expires
     *                    pending requests after 7 days.
     */
    status: text("status").notNull().default("pending"),
    /**
     * The platform admin who created the request. SET NULL on
     * user deletion preserves the audit row.
     */
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * The agency admin who decided the request. NULL until
     * the request is approved or rejected.
     */
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "date" }),
    decisionReason: text("decision_reason"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("support_access_request_ticket_idx").on(t.ticketReference),
    index("support_access_request_target_idx").on(t.targetAgencyId, sql`${t.createdAt} DESC`),
    index("support_access_request_status_idx").on(t.status, sql`${t.createdAt} DESC`),
    check(
      "support_access_request_status_check",
      sql`${t.status} IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')`,
    ),
    check(
      "support_access_request_duration_positive",
      sql`${t.requestedDurationHours} > 0 AND ${t.requestedDurationHours} <= 168`,
    ),
  ],
);

// ─── supportAccessGrants ───────────────────────────────────────────────────
/**
 * The time-limited authorisation that unlocks tenant content for
 * a single platform administrator. One grant per request — the
 * UNIQUE constraint on `request_id` is the application-level
 * invariant. `revoked_at IS NULL` + `expires_at > now()` is the
 * "currently active" predicate.
 */
export const supportAccessGrants = pgTable(
  "support_access_grant",
  {
    id: idColumn(),
    requestId: uuid("request_id")
      .notNull()
      .unique()
      .references(() => supportAccessRequests.id, { onDelete: "cascade" }),
    targetAgencyId: uuid("target_agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /**
     * Snapshot of the request's scope at grant time. Decoupling
     * the grant from the request (via a snapshot) means a later
     * change to the request cannot retroactively widen or
     * narrow the active grant.
     */
    scopeWorkspaceId: uuid("scope_workspace_id").references(() => workspaces.id, {
      onDelete: "cascade",
    }),
    scopeMetadataOnly: boolean("scope_metadata_only").notNull().default(false),
    /**
     * Whether exports / downloads are allowed. Defaults to
     * false. The agency admin can approve with downloads only
     * by recording `downloadsAllowed = true` explicitly. Even
     * with downloads allowed, the audit log records every
     * download request.
     */
    downloadsAllowed: boolean("downloads_allowed").notNull().default(false),
    /**
     * The agency admin who approved the request. Required at
     * insert time. RESTRICT on user delete preserves the
     * audit trail.
     */
    approvedByUserId: uuid("approved_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /**
     * The platform admin who will use the grant. This is the
     * `requestedByUserId` from the request at approval time.
     * RESTRICT — the grant is meaningless without the grantee.
     */
    grantedToUserId: uuid("granted_to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    activatedAt: timestamp("activated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    /**
     * The hard expiry. The service layer refuses to honour a
     * grant whose `expires_at <= now()`. A revoked grant keeps
     * its `expires_at` as a historical record of the original
     * decision.
     */
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    revokedByUserId: uuid("revoked_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedReason: text("revoked_reason"),
    ...timestamps,
  },
  (t) => [
    index("support_access_grant_target_idx").on(t.targetAgencyId, sql`${t.createdAt} DESC`),
    // "Active grants" lookup — only non-revoked grants. The
    // partial index keeps the lookup cheap because the vast
    // majority of grants are historical.
    index("support_access_grant_active_idx")
      .on(t.grantedToUserId, t.expiresAt)
      .where(sql`${t.revokedAt} IS NULL`),
    check("support_access_grant_expires_after_activated", sql`${t.expiresAt} > ${t.activatedAt}`),
  ],
);

// ─── supportAccessAudit (APPEND-ONLY) ──────────────────────────────────────
/**
 * Every object a platform administrator views through an active
 * grant produces one row. The BEFORE UPDATE / BEFORE DELETE
 * triggers installed in migration 0012 RAISE an exception, making
 * this table append-only at the DB level.
 *
 * The shape mirrors the existing `securityAuditEvent` table
 * because the security team will read both; the `grant_id` column
 * is the link from the support view to the underlying grant that
 * authorised the view. The `metadata` JSONB is intentionally
 * narrow — the agency, the workspace, the route, and the request
 * id. No prompt bodies, no response bodies, no tenant content.
 */
export const supportAccessAudit = pgTable(
  "support_access_audit",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    grantId: uuid("grant_id").references(() => supportAccessGrants.id, {
      onDelete: "set null",
    }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    targetAgencyId: uuid("target_agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    action: text("action").notNull(),
    outcome: text("outcome").notNull(),
    ip: inet("ip"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    metadata: jsonbNullable("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("support_access_audit_actor_idx").on(t.actorUserId, sql`${t.createdAt} DESC`),
    index("support_access_audit_target_idx").on(
      t.targetAgencyId,
      t.targetType,
      sql`${t.createdAt} DESC`,
    ),
    index("support_access_audit_grant_idx").on(t.grantId, sql`${t.createdAt} DESC`),
    check(
      "support_access_audit_outcome_check",
      sql`${t.outcome} IN ('success', 'denied', 'failed')`,
    ),
  ],
);

// ─── aiDailyBudgetUsage ────────────────────────────────────────────────────
/**
 * Per-(agency, user, day) request counter. The AI generation
 * route reserves capacity in this table inside the same
 * transaction as the monthly reservation, so concurrent users in
 * the same agency cannot exceed `daily_ai_requests_per_user`.
 *
 * The composite primary key is `(agency_id, user_id, usage_date)`.
 * The application layer is responsible for upserting with the
 * correct `usage_date` (UTC). A row older than 24h is not pruned
 * here — the application reads today's row only, so the historical
 * rows exist purely for audit / debugging.
 */
export const aiDailyBudgetUsage = pgTable(
  "ai_daily_budget_usage",
  {
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    usageDate: date("usage_date").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    lastRequestId: text("last_request_id"),
    lastRecordedAt: timestamp("last_recorded_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("ai_daily_budget_usage_agency_date_idx").on(t.agencyId, sql`${t.usageDate} DESC`),
    check("ai_daily_budget_usage_request_count_nonneg", sql`${t.requestCount} >= 0`),
  ],
);
