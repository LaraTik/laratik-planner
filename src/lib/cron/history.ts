import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cronTickHistory, type CronKekStatus, type CronTickOutcome } from "@/lib/db/schema";
import { captureError } from "@/lib/observability/sentry";
import { getRequestId } from "@/lib/observability/request-context";

/**
 * Phase 1 of the social-cron-admin plan.
 *
 * `cron_tick_history` persistence helpers. The route layer is the
 * only writer; readers are the platform-admin `/app/platform/operations/cron`
 * page (Phase 2) and the "Run now" audit hook (Phase 3).
 *
 * Design contract:
 *
 *   1. Writes must NEVER break the cron. If the history table is
 *      wedged (constraint violation, missing column, disk full),
 *      the tick still returns the same JSON to the VPS script. The
 *      write failure fans out to Sentry + structured log via
 *      `captureError('cron.history.write_failed', err, ...)`.
 *   2. Writes are best-effort and fire-and-forget from the route's
 *      perspective. The route doesn't `await` the insert in a way
 *      that adds a round trip to the request budget — the route
 *      records the tick BEFORE returning so a hung downstream
 *      client doesn't lose the history row.
 *   3. Reads are small bounded queries. The page-level helpers
 *      (`getLatestTickForCron`, `getTickRollup`, `getRecentTicksForCron`)
 *      all hit the `(cron_name, started_at DESC)` partial index and
 *      return a handful of rows. No full table scan.
 *
 * Schema reference: `src/lib/db/schema/cron.ts`. The migration is
 * `0024_cron_tick_history.sql`. Retention: 30d default, pruned by
 * `scripts/vps/audit-retention.sh` (`CRON_TICK_RETENTION_DAYS`).
 */

export type CronTickInput = {
  cronName: string;
  startedAt: Date;
  finishedAt: Date;
  outcome: CronTickOutcome;
  claimed: number;
  succeeded: number;
  failed: number;
  needsReauth: number;
  skipped: number;
  kekStatus: CronKekStatus | null;
  retention: { oauthStatesDeleted?: number; oldMetricsDeleted?: number };
  errorText: string | null;
  triggeredBy: string;
};

/**
 * Write one tick row. Returns the row id on success, `null` on
 * failure. The caller MUST treat `null` as best-effort-no-op and
 * MUST NOT throw — the cron itself succeeded; the audit table
 * write is a non-critical observability artifact.
 */
export async function recordCronTick(input: CronTickInput): Promise<number | null> {
  try {
    const [row] = await db
      .insert(cronTickHistory)
      .values({
        cronName: input.cronName,
        startedAt: input.startedAt,
        finishedAt: input.finishedAt,
        outcome: input.outcome,
        claimed: input.claimed,
        succeeded: input.succeeded,
        failed: input.failed,
        needsReauth: input.needsReauth,
        skipped: input.skipped,
        kekStatus: input.kekStatus,
        retention: input.retention as unknown as Record<string, unknown>,
        errorText: input.errorText,
        triggeredBy: input.triggeredBy,
        requestId: getRequestId() ?? null,
      })
      .returning({ id: cronTickHistory.id });
    return row?.id ?? null;
  } catch (err) {
    // Don't let an audit-table outage take down the cron. The
    // wrapper fans to Sentry + structured log so a sustained
    // outage trips the OBS-001 alert rule
    // (`cron.history.write_failed:5m` > 0).
    captureError("cron.history.write_failed", err, {
      cronName: input.cronName,
      outcome: input.outcome,
    });
    return null;
  }
}

// ─── Readers (Phase 2) ─────────────────────────────────────────────────────

export type CronTickRow = {
  id: number;
  cronName: string;
  startedAt: Date;
  finishedAt: Date | null;
  outcome: CronTickOutcome;
  claimed: number;
  succeeded: number;
  failed: number;
  needsReauth: number;
  skipped: number;
  kekStatus: CronKekStatus | null;
  errorText: string | null;
  triggeredBy: string;
  requestId: string | null;
};

function rowToTick(row: typeof cronTickHistory.$inferSelect): CronTickRow {
  return {
    id: row.id,
    cronName: row.cronName,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    outcome: row.outcome as CronTickOutcome,
    claimed: row.claimed,
    succeeded: row.succeeded,
    failed: row.failed,
    needsReauth: row.needsReauth,
    skipped: row.skipped,
    kekStatus: (row.kekStatus ?? null) as CronKekStatus | null,
    errorText: row.errorText,
    triggeredBy: row.triggeredBy,
    requestId: row.requestId,
  };
}

/**
 * Most recent tick for a given cron, or `null` if no tick has
 * been recorded yet. The query hits the
 * `(cron_name, started_at DESC)` index.
 */
export async function getLatestTickForCron(cronName: string): Promise<CronTickRow | null> {
  const [row] = await db
    .select()
    .from(cronTickHistory)
    .where(eq(cronTickHistory.cronName, cronName))
    .orderBy(desc(cronTickHistory.startedAt))
    .limit(1);
  return row ? rowToTick(row) : null;
}

/**
 * Aggregate counts over a time window. The Phase 2 page calls this
 * with `since = now - 24h` to render the 24h strip. The query is
 * a single full-table scan under the index, bounded by `cron_name`
 * + `started_at >= since`. Cost is O(ticks-in-window), which at
 * 96 ticks/day × 30d is < 3k rows.
 */
export type CronTickRollup = {
  ticks: number;
  claimed: number;
  succeeded: number;
  failed: number;
  needsReauth: number;
  skipped: number;
  successCount: number;
  softDeadlineCount: number;
  errorCount: number;
  skippedFlagOffCount: number;
  lastErrorText: string | null;
};

const ZERO_ROLLUP: CronTickRollup = {
  ticks: 0,
  claimed: 0,
  succeeded: 0,
  failed: 0,
  needsReauth: 0,
  skipped: 0,
  successCount: 0,
  softDeadlineCount: 0,
  errorCount: 0,
  skippedFlagOffCount: 0,
  lastErrorText: null,
};

export async function getTickRollup(cronName: string, since: Date): Promise<CronTickRollup> {
  const rows = await db
    .select({
      outcome: cronTickHistory.outcome,
      claimed: cronTickHistory.claimed,
      succeeded: cronTickHistory.succeeded,
      failed: cronTickHistory.failed,
      needsReauth: cronTickHistory.needsReauth,
      skipped: cronTickHistory.skipped,
      errorText: cronTickHistory.errorText,
    })
    .from(cronTickHistory)
    .where(and(eq(cronTickHistory.cronName, cronName), gte(cronTickHistory.startedAt, since)))
    .orderBy(desc(cronTickHistory.startedAt))
    .limit(500);
  if (rows.length === 0) return ZERO_ROLLUP;
  const rollup: CronTickRollup = { ...ZERO_ROLLUP };
  for (const r of rows) {
    rollup.ticks += 1;
    rollup.claimed += r.claimed;
    rollup.succeeded += r.succeeded;
    rollup.failed += r.failed;
    rollup.needsReauth += r.needsReauth;
    rollup.skipped += r.skipped;
    if (r.outcome === "success") rollup.successCount += 1;
    else if (r.outcome === "soft_deadline") rollup.softDeadlineCount += 1;
    else if (r.outcome === "error") rollup.errorCount += 1;
    else if (r.outcome === "skipped") rollup.skippedFlagOffCount += 1;
    if (r.outcome === "error" && rollup.lastErrorText === null) {
      rollup.lastErrorText = r.errorText;
    }
  }
  return rollup;
}

/**
 * Most recent `limit` ticks for a given cron, newest first. Used
 * by the Phase 2 "log tail" view (last 50 rows).
 */
export async function getRecentTicksForCron(cronName: string, limit = 50): Promise<CronTickRow[]> {
  const rows = await db
    .select()
    .from(cronTickHistory)
    .where(eq(cronTickHistory.cronName, cronName))
    .orderBy(desc(cronTickHistory.startedAt))
    .limit(limit);
  return rows.map(rowToTick);
}

/**
 * Distinct cron names with at least one tick in the last 30d. The
 * Phase 2 page iterates over this list to render one card per cron
 * that has actually run, instead of a hardcoded list. A cron that
 * has never run (e.g. a brand-new cron route) won't appear until
 * its first tick lands; the page renders a "no ticks yet" empty
 * state in that case.
 */
export async function getActiveCronNames(since: Date): Promise<string[]> {
  const rows = await db
    .selectDistinct({ cronName: cronTickHistory.cronName })
    .from(cronTickHistory)
    .where(gte(cronTickHistory.startedAt, since))
    .orderBy(sql`${cronTickHistory.cronName} ASC`);
  return rows.map((r) => r.cronName);
}
