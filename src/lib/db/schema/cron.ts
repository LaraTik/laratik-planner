import { sql } from "drizzle-orm";
import { bigserial, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { jsonb } from "./_helpers";

/**
 * `cron_tick_history` — M4.7 / Phase 1 of the social-cron-admin plan.
 *
 * The cron routes (`/api/cron/social-metrics`, `/api/cron/outbox`,
 * `/api/cron/email-dispatch`, etc.) are the only writers. The table
 * gives the platform operator a single in-app source of truth for:
 *
 *   - "Is the cron alive?" — last `started_at` per `cron_name`.
 *   - "What did the last tick do?" — `claimed`, `succeeded`, `failed`,
 *     `needs_reauth`, `skipped`, `kek_status`, `error_text`.
 *   - "How is the cron trending?" — the index
 *     `(cron_name, started_at DESC)` powers the "last 24h" / "last
 *     96 ticks" rollups on `/app/platform/operations/cron` (Phase 2).
 *   - "Who triggered this tick?" — `triggered_by` is `'cron'` for
 *     normal ticks, `'manual:<actor_id>'` for the Phase 3 "Run now"
 *     button (platform-admin-only).
 *
 * `outcome` is constrained to `success | soft_deadline | error |
 * skipped` (see the migration CHECK). `kek_status` is text because
 * only the social-metrics cron currently reports a KEK status; the
 * column is nullable so outbox / email / audit-retention can write
 * NULL without ceremony.
 *
 * Retention is handled by `scripts/vps/audit-retention.sh` (30d
 * default, `CRON_TICK_RETENTION_DAYS` override).
 *
 * The `request_id` column ties a tick to its structured log line so
 * an Sentry error on a tick links back to the matching log entry
 * without a separate correlation table.
 */
export const cronTickHistory = pgTable(
  "cron_tick_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    cronName: text("cron_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    outcome: text("outcome").notNull(),
    claimed: integer("claimed").notNull().default(0),
    succeeded: integer("succeeded").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    needsReauth: integer("needs_reauth").notNull().default(0),
    skipped: integer("skipped").notNull().default(0),
    kekStatus: text("kek_status"),
    retention: jsonb("retention"),
    errorText: text("error_text"),
    triggeredBy: text("triggered_by").notNull().default("cron"),
    requestId: text("request_id"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [
    index("cron_tick_history_cron_started_idx").on(t.cronName, sql`${t.startedAt} DESC`),
    index("cron_tick_history_started_idx").on(sql`${t.startedAt} DESC`),
  ],
);

/**
 * Documented outcome vocabulary. The route layer uses these exact
 * strings; the migration's CHECK constraint rejects anything else.
 */
export const CRON_TICK_OUTCOMES = ["success", "soft_deadline", "error", "skipped"] as const;
export type CronTickOutcome = (typeof CRON_TICK_OUTCOMES)[number];

/**
 * Documented KEK status vocabulary. Only the social-metrics cron
 * writes a non-null value; outbox / email / audit-retention write
 * NULL.
 */
export const CRON_KEK_STATUSES = ["ok", "kek_missing"] as const;
export type CronKekStatus = (typeof CRON_KEK_STATUSES)[number];
