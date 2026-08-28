import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { ContentStatus } from "@/lib/content/status";
import {
  ALL_CONTENT_STATUSES,
  EMPTY_RESET_ALL_COUNTS,
  type ResetAllIdeasCounts,
} from "./reset-all-ideas-shared";

// 2026-08-28: the client component `bulk-reset-confirm-dialog.tsx`
// imports `ALL_CONTENT_STATUSES` and `CONTENT_STATUS_LABELS` (and
// the `ResetAllIdeasCounts` type) as RUNTIME values from this
// module. That triggered `next build` to fail with:
//
//   "You're importing a module that depends on 'server-only'..."
//
// The constants and type now live in `reset-all-ideas-shared.ts`
// (no `import "server-only"`, safe for both Server and Client
// Components). The single-idea fix in d0cc4b9 established this
// pattern; this commit applies it to the bulk variant. We
// re-export from this module so existing server-side callers
// (`reset-all-ideas-action.ts`, the settings page) keep their
// existing import paths.
export {
  ALL_CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  EMPTY_RESET_ALL_COUNTS,
  LIVE_STATUSES,
  type ResetAllIdeasCounts,
} from "./reset-all-ideas-shared";

/**
 * Bulk "Reset all ideas" destructive operation.
 *
 * Companion to the per-idea `src/lib/content/reset-idea.ts`. This
 * module hard-deletes EVERY content item in a workspace, with an
 * opt-in toggle for live (published / partially_published) ideas.
 * The same FK CASCADE behaviour applies — 8 child tables per idea
 * are removed; 3 SET-NULL tables keep their rows with the link
 * cleared.
 *
 * The "includePublished" toggle is the only safety net between
 * "delete all the drafts" and "delete live social posts". The
 * default is OFF. When OFF, the operator sees how many live ideas
 * are being SKIPPED so the count is fully transparent.
 */

function emptyByStatus(): Record<ContentStatus, number> {
  return ALL_CONTENT_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<ContentStatus, number>,
  );
}

type CountRow = {
  total_all: string;
  total_live: string;
  by_status: Record<string, string> | string;
};

/**
 * Postgres returns `jsonb_agg` / `jsonb_object_agg` results as the
 * raw JSON string under node-postgres. Some Drizzle wrappers give
 * us a parsed object; this normalises both.
 */
function parseByStatus(
  raw: Record<string, string> | string | null | undefined,
): Record<ContentStatus, number> {
  const out = emptyByStatus();
  if (!raw) return out;
  const obj =
    typeof raw === "string"
      ? (() => {
          try {
            return JSON.parse(raw) as Record<string, number | string>;
          } catch {
            return {} as Record<string, number | string>;
          }
        })()
      : (raw as Record<string, number | string>);
  for (const status of ALL_CONTENT_STATUSES) {
    const v = obj[status];
    if (typeof v === "number") {
      out[status] = v;
    } else if (typeof v === "string") {
      const n = Number(v);
      if (Number.isFinite(n)) out[status] = n;
    }
  }
  return out;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

/**
 * Read the per-status counts for the destructive "Reset all ideas"
 * pre-flight. `includePublished` controls whether the live statuses
 * (`published`, `partially_published`) are included in `total` and
 * `byStatus`, but `totalLive` is always returned so the dialog
 * can tell the operator how many live ideas are being skipped.
 */
export async function getResetAllIdeasCounts(
  workspaceId: string,
  includePublished: boolean,
): Promise<ResetAllIdeasCounts> {
  // Build a SQL fragment that filters out live rows when the
  // toggle is off. We keep the aggregate shape identical so the
  // parser doesn't have to branch.
  const liveFilter = includePublished
    ? sql`TRUE`
    : sql`status NOT IN ('published', 'partially_published')`;

  const result = await db.execute<CountRow>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM content_item WHERE workspace_id = ${workspaceId}) AS total_all,
      (SELECT COUNT(*)::int FROM content_item
        WHERE workspace_id = ${workspaceId}
          AND status IN ('published', 'partially_published')) AS total_live,
      (
        SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb)
        FROM (
          SELECT status, COUNT(*)::int AS n
          FROM content_item
          WHERE workspace_id = ${workspaceId} AND ${liveFilter}
          GROUP BY status
        ) s
      ) AS by_status
  `);

  const rows = resultRows<CountRow>(result);
  if (rows.length === 0 || !rows[0]) return EMPTY_RESET_ALL_COUNTS;
  const row = rows[0];
  const totalAll = Number(row.total_all);
  const totalLive = Number(row.total_live);
  const byStatus = parseByStatus(row.by_status);
  const total = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
  const totalExcludedByDefault = includePublished ? 0 : totalLive;
  return {
    total,
    byStatus,
    totalAllIdeas: totalAll,
    totalExcludedByDefault,
    totalLive,
  };
}
