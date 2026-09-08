import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { idColumn, timestamps } from "./_helpers";
import { agencies, users } from "./identity";
import { workspaces } from "./workspaces";
import { contentItems } from "./content";

/**
 * Trend Radar — STUDIOFLOW_MASTER_PROMPT.md §13–§20.
 *
 * 12 additive tables for the trend discovery, curation, closed-loop
 * brief measurement, source health, audit, and per-workspace opt-out
 * subsystems:
 *
 *  1.  trend_source           — per-agency source enablement + config
 *  2.  trend_signal           — normalized trend data with embeddings
 *  3.  trend_board            — user-curated collections
 *  4.  trend_board_item       — board membership
 *  5.  trend_brief            — closed-loop: trend → content item
 *  6.  trend_fetch_job        — sync job log
 *  7.  trend_source_health    — per-source health snapshot (§13.5)
 *  8.  trend_source_audit     — append-only audit log (§20)
 *  9.  trend_source_activity  — per-source activity feed (§13.10)
 *  10. trend_feedback         — user feedback for Fit score training
 *  11. saved_filter           — saved Trends filters (§14.2)
 *  12. workspace_source_optout — per-workspace source opt-out (§13.8)
 *
 * Additive: these tables are net-new. No existing column is altered.
 *
 * Per the schema rules in `_helpers.ts` every mutable table carries
 * `created_at` + `updated_at`; tables that are append-only (jobs,
 * audits, activities, feedback events, opt-outs) only carry
 * `created_at`.
 *
 * `trend_source.api_key_ref` is intentionally declared as a plain
 * UUID without a Drizzle `.references()` call. The referenced
 * `provider_secret.id` column will be added in a follow-up migration
 * (see the channels.ts pattern for `socialConnectionId` for the
 * same shape).
 */

// ─── 1. trend_source ──────────────────────────────────────────────────────
// Per-agency source configuration. The natural key is
// (agencyId, sourceKey).
export const trendSources = pgTable(
  "trend_source",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    displayName: text("display_name").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    tier: text("tier").notNull(), // 'free' | 'paid' | 'experimental'
    tosClass: text("tos_class").notNull(), // 'clean' | 'grey' | 'review_required'
    region: text("region").notNull().default("XX"),
    languageFilter: jsonb("language_filter")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    cadenceOverride: text("cadence_override"),
    maxSignalsPerCycle: integer("max_signals_per_cycle").notNull().default(200),
    // Encrypted provider references are opaque `keyVersion:lastFour`
    // handles, not Postgres ids. The ciphertext never lives here.
    apiKeyRef: text("api_key_ref"),
    config: jsonb("config")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    tosAcknowledgedBy: uuid("tos_acknowledged_by").references(() => users.id, {
      onDelete: "set null",
    }),
    tosAcknowledgedAt: timestamp("tos_acknowledged_at", { withTimezone: true, mode: "date" }),
    enabledBy: uuid("enabled_by").references(() => users.id, { onDelete: "set null" }),
    enabledAt: timestamp("enabled_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    unique("trend_source_agency_source_unique").on(t.agencyId, t.sourceKey),
    index("trend_source_agency_enabled_idx").on(t.agencyId, t.enabled),
    check("trend_source_tier_valid", sql`${t.tier} IN ('free', 'paid', 'experimental')`),
    check(
      "trend_source_tos_class_valid",
      sql`${t.tosClass} IN ('clean', 'grey', 'review_required')`,
    ),
  ],
);

// ─── 2. trend_signal ──────────────────────────────────────────────────────
// Normalized trend data. The hot query is "latest signals for this
// workspace on this platform" — covered by the
// (workspaceId, platform, fetchedAt desc) index. The
// (sourceKey, sourceId) index supports the per-source dedup path
// that the fetcher uses to skip already-stored signals.
export const trendSignals = pgTable(
  "trend_signal",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    type: text("type").notNull(),
    label: text("label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    language: text("language").notNull().default("en"),
    region: text("region").notNull().default("XX"),
    score: real("score").notNull(),
    rawScore: real("raw_score"),
    rawPayload: jsonb("raw_payload").notNull(),
    velocity: real("velocity").notNull().default(0),
    lifecycle: text("lifecycle").notNull().default("stable"),
    sentiment: real("sentiment").notNull().default(0),
    toxicity: real("toxicity").notNull().default(0),
    safeToAmplify: boolean("safe_to_amplify").notNull().default(true),
    vertical: jsonb("vertical")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    embedding: jsonb("embedding").$type<number[]>(),
    sourceUrl: text("source_url"),
    sourceId: text("source_id").notNull(),
    sourceKey: text("source_key").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [
    index("trend_signal_workspace_platform_fetched_idx").on(
      t.workspaceId,
      t.platform,
      sql`${t.fetchedAt} DESC`,
    ),
    index("trend_signal_workspace_label_platform_idx").on(
      t.workspaceId,
      t.normalizedLabel,
      t.platform,
    ),
    index("trend_signal_source_dedup_idx").on(t.sourceKey, t.sourceId),
    index("trend_signal_workspace_lifecycle_score_idx").on(
      t.workspaceId,
      t.lifecycle,
      sql`${t.score} DESC`,
    ),
    check(
      "trend_signal_platform_valid",
      sql`${t.platform} IN ('x', 'instagram', 'tiktok', 'youtube', 'reddit', 'linkedin', 'threads', 'facebook', 'pinterest', 'google_trends', 'spotify')`,
    ),
    check(
      "trend_signal_type_valid",
      sql`${t.type} IN ('hashtag', 'sound', 'creator', 'topic', 'format', 'aesthetic', 'news', 'event', 'product')`,
    ),
    check(
      "trend_signal_lifecycle_valid",
      sql`${t.lifecycle} IN ('emerging', 'peaking', 'declining', 'stable')`,
    ),
  ],
);

// ─── 3. trend_board ───────────────────────────────────────────────────────
// User-curated collection of saved trends. shareScope lets a user
// publish a board to the workspace or agency.
export const trendBoards = pgTable(
  "trend_board",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isDefault: boolean("is_default").notNull().default(false),
    shareScope: text("share_scope").notNull().default("me"), // 'me' | 'workspace' | 'agency'
    ...timestamps,
  },
  (t) => [
    index("trend_board_workspace_user_idx").on(t.workspaceId, t.userId),
    check("trend_board_share_scope_valid", sql`${t.shareScope} IN ('me', 'workspace', 'agency')`),
  ],
);

// ─── 4. trend_board_item ──────────────────────────────────────────────────
// Trend in a board. Composite primary key on (boardId, signalId).
// `feedback` is the thumbs-up / thumbs-down signal the service uses
// to weight the Fit score.
export const trendBoardItems = pgTable(
  "trend_board_item",
  {
    boardId: uuid("board_id")
      .notNull()
      .references(() => trendBoards.id, { onDelete: "cascade" }),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => trendSignals.id, { onDelete: "cascade" }),
    savedAt: timestamp("saved_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    dismissed: boolean("dismissed").notNull().default(false),
    feedback: text("feedback"), // 'positive' | 'negative' | null
    notes: text("notes"),
  },
  (t) => [
    primaryKey({ columns: [t.boardId, t.signalId] }),
    index("trend_board_item_signal_idx").on(t.signalId),
    check(
      "trend_board_item_feedback_valid",
      sql`${t.feedback} IS NULL OR ${t.feedback} IN ('positive', 'negative')`,
    ),
  ],
);

// ─── 5. trend_brief ───────────────────────────────────────────────────────
// Closed-loop measurement: a content item ridden on a trend. The
// `reach_multiplier` is the headline 4x metric surfaced on the
// platform dashboard. `signal_id` is SET NULL on delete so the
// measurement row outlives the source signal.
export const trendBriefs = pgTable(
  "trend_brief",
  {
    id: idColumn(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    signalId: uuid("signal_id").references(() => trendSignals.id, { onDelete: "set null" }),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    velocityAtSchedule: real("velocity_at_schedule"),
    velocityAtPublish: real("velocity_at_publish"),
    reachMultiplier: real("reach_multiplier"),
    agencyFeedback: text("agency_feedback"), // 'would_ride_again' | 'would_not_ride' | null
    feedbackAt: timestamp("feedback_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("trend_brief_workspace_created_idx").on(t.workspaceId, sql`${t.createdAt} DESC`),
    index("trend_brief_signal_idx").on(t.signalId),
    check(
      "trend_brief_agency_feedback_valid",
      sql`${t.agencyFeedback} IS NULL OR ${t.agencyFeedback} IN ('would_ride_again', 'would_not_ride')`,
    ),
  ],
);

// ─── 6. trend_fetch_job ───────────────────────────────────────────────────
// Sync job log per source per workspace. Append-only at the
// application layer — there is no UPDATE in the service path.
export const trendFetchJobs = pgTable(
  "trend_fetch_job",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    status: text("status").notNull(), // 'queued' | 'running' | 'success' | 'error' | 'degraded'
    signalsAdded: integer("signals_added").notNull().default(0),
    durationMs: integer("duration_ms"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    fallbackUsed: text("fallback_used"),
    cachedFallback: boolean("cached_fallback").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("trend_fetch_job_workspace_source_created_idx").on(
      t.workspaceId,
      t.sourceKey,
      sql`${t.createdAt} DESC`,
    ),
    index("trend_fetch_job_status_created_idx").on(t.status, sql`${t.createdAt} DESC`),
    check(
      "trend_fetch_job_status_valid",
      sql`${t.status} IN ('queued', 'running', 'success', 'error', 'degraded')`,
    ),
  ],
);

// ─── 7. trend_source_health ───────────────────────────────────────────────
// Per-source health snapshot, refreshed on every fetch (§13.5). One
// row per (agencyId, sourceKey); the latest `checked_at` is the
// current health read.
export const trendSourceHealth = pgTable(
  "trend_source_health",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    status: text("status").notNull(), // 'healthy' | 'degraded' | 'down' | 'disabled' | 'rate_limited' | 'quota_exhausted'
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
    lastError: jsonb("last_error").$type<{ code: string; message: string; at: string } | null>(),
    successRate24h: real("success_rate_24h"),
    avgLatencyMs: integer("avg_latency_ms"),
    signalsLast24h: integer("signals_last_24h"),
    rateLimitUsed: real("rate_limit_used"),
    rateLimitQuota: real("rate_limit_quota"),
    rateLimitResetsAt: timestamp("rate_limit_resets_at", { withTimezone: true, mode: "date" }),
    costCentsLast24h: integer("cost_cents_last_24h"),
    circuitState: text("circuit_state"), // 'closed' | 'open' | 'half_open'
    circuitOpenedAt: timestamp("circuit_opened_at", { withTimezone: true, mode: "date" }),
    checkedAt: timestamp("checked_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    unique("trend_source_health_agency_source_unique").on(t.agencyId, t.sourceKey),
    index("trend_source_health_agency_status_idx").on(t.agencyId, t.status),
    check(
      "trend_source_health_status_valid",
      sql`${t.status} IN ('healthy', 'degraded', 'down', 'disabled', 'rate_limited', 'quota_exhausted')`,
    ),
    check(
      "trend_source_health_circuit_state_valid",
      sql`${t.circuitState} IS NULL OR ${t.circuitState} IN ('closed', 'open', 'half_open')`,
    ),
  ],
);

// ─── 8. trend_source_audit ────────────────────────────────────────────────
// Append-only audit log of every source configuration change (§20).
// The service layer is responsible for never UPDATEing or DELETEing
// these rows.
export const trendSourceAudits = pgTable(
  "trend_source_audit",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(), // 'enable' | 'disable' | 'configure' | 'test' | 'break' | 'recover'
    reason: text("reason"),
    beforeState: jsonb("before_state").$type<Record<string, unknown> | null>(),
    afterState: jsonb("after_state").$type<Record<string, unknown> | null>(),
    result: text("result").notNull(), // 'success' | 'failure'
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("trend_source_audit_agency_source_created_idx").on(
      t.agencyId,
      t.sourceKey,
      sql`${t.createdAt} DESC`,
    ),
    index("trend_source_audit_actor_created_idx").on(t.actorUserId, sql`${t.createdAt} DESC`),
    check(
      "trend_source_audit_action_valid",
      sql`${t.action} IN ('enable', 'disable', 'configure', 'test', 'break', 'recover')`,
    ),
    check("trend_source_audit_result_valid", sql`${t.result} IN ('success', 'failure')`),
  ],
);

// ─── 9. trend_source_activity ─────────────────────────────────────────────
// Per-source activity feed (§13.10). Retention is application-level
// (100 entries per source) — no DB trigger. Cheap to keep because
// each row is just a few hundred bytes.
export const trendSourceActivities = pgTable(
  "trend_source_activity",
  {
    id: idColumn(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    sourceKey: text("source_key").notNull(),
    eventType: text("event_type").notNull(),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("trend_source_activity_agency_source_created_idx").on(
      t.agencyId,
      t.sourceKey,
      sql`${t.createdAt} DESC`,
    ),
    check(
      "trend_source_activity_event_type_valid",
      sql`${t.eventType} IN ('sync_completed', 'sync_failed', 'enabled', 'disabled', 'configured', 'rate_limited', 'fallback_engaged')`,
    ),
  ],
);

// ─── 10. trend_feedback ───────────────────────────────────────────────────
// User feedback events for Fit score training. The `weight_delta`
// JSONB is the per-dimension delta the trainer applies on the next
// Fit score recompute.
export const trendFeedbacks = pgTable(
  "trend_feedback",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    signalId: uuid("signal_id")
      .notNull()
      .references(() => trendSignals.id, { onDelete: "cascade" }),
    feedbackType: text("feedback_type").notNull(),
    weightDelta: jsonb("weight_delta").$type<{
      vertical?: number;
      audience?: number;
      voice?: number;
      platform?: number;
      competitive?: number;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("trend_feedback_workspace_user_created_idx").on(
      t.workspaceId,
      t.userId,
      sql`${t.createdAt} DESC`,
    ),
    index("trend_feedback_signal_idx").on(t.signalId),
    check(
      "trend_feedback_feedback_type_valid",
      sql`${t.feedbackType} IN ('use_in_brief', 'save', 'dismiss', 'would_ride_again', 'would_not_ride')`,
    ),
  ],
);

// ─── 11. saved_filter ─────────────────────────────────────────────────────
// Saved Trends filters (§14.2). `is_template` + `template_key`
// surface built-in templates like `niche_daily` / `b2b_pulse` so the
// UI can offer them alongside user-saved filters.
export const savedFilters = pgTable(
  "saved_filter",
  {
    id: idColumn(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
    shareScope: text("share_scope").notNull().default("me"), // 'me' | 'workspace' | 'agency'
    isTemplate: boolean("is_template").notNull().default(false),
    templateKey: text("template_key"),
    ...timestamps,
  },
  (t) => [
    index("saved_filter_workspace_user_idx").on(t.workspaceId, t.userId),
    index("saved_filter_share_scope_idx").on(t.shareScope),
    check("saved_filter_share_scope_valid", sql`${t.shareScope} IN ('me', 'workspace', 'agency')`),
  ],
);

// ─── 12. workspace_source_optout ──────────────────────────────────────────
// Per-workspace opt-out from a source (§13.8). Distinct from
// `trend_source.enabled`: opt-out is a workspace override of the
// agency-level enable.
export const workspaceSourceOptouts = pgTable(
  "workspace_source_optout",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sourceKey: text("source_key").notNull(),
    optedOutBy: uuid("opted_out_by").references(() => users.id, { onDelete: "set null" }),
    optedOutAt: timestamp("opted_out_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    reason: text("reason"),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.sourceKey] }),
    index("workspace_source_optout_source_idx").on(t.sourceKey),
  ],
);

// ─── Inferred row types ───────────────────────────────────────────────────
export type TrendSource = typeof trendSources.$inferSelect;
export type NewTrendSource = typeof trendSources.$inferInsert;
export type TrendSignal = typeof trendSignals.$inferSelect;
export type NewTrendSignal = typeof trendSignals.$inferInsert;
export type TrendBoard = typeof trendBoards.$inferSelect;
export type NewTrendBoard = typeof trendBoards.$inferInsert;
export type TrendBoardItem = typeof trendBoardItems.$inferSelect;
export type NewTrendBoardItem = typeof trendBoardItems.$inferInsert;
export type TrendBrief = typeof trendBriefs.$inferSelect;
export type NewTrendBrief = typeof trendBriefs.$inferInsert;
export type TrendFetchJob = typeof trendFetchJobs.$inferSelect;
export type NewTrendFetchJob = typeof trendFetchJobs.$inferInsert;
export type TrendSourceHealth = typeof trendSourceHealth.$inferSelect;
export type NewTrendSourceHealth = typeof trendSourceHealth.$inferInsert;
export type TrendSourceAudit = typeof trendSourceAudits.$inferSelect;
export type NewTrendSourceAudit = typeof trendSourceAudits.$inferInsert;
export type TrendSourceActivity = typeof trendSourceActivities.$inferSelect;
export type NewTrendSourceActivity = typeof trendSourceActivities.$inferInsert;
export type TrendFeedback = typeof trendFeedbacks.$inferSelect;
export type NewTrendFeedback = typeof trendFeedbacks.$inferInsert;
export type SavedFilter = typeof savedFilters.$inferSelect;
export type NewSavedFilter = typeof savedFilters.$inferInsert;
export type WorkspaceSourceOptout = typeof workspaceSourceOptouts.$inferSelect;
export type NewWorkspaceSourceOptout = typeof workspaceSourceOptouts.$inferInsert;
