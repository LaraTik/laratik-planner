import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  contentItems,
  users,
  workspaceMemberships,
  workspaceMembershipRoles,
  workspaces,
} from "@/lib/db/schema";
import { listRecentBrandUpdates } from "@/lib/brand/service";

/**
 * Workspace activity — the unified, workspace-scoped activity feed.
 *
 * Sources (today):
 *   1. `activity_event` table (already records content_item / review /
 *      plan / publication / settings actions via the helpers in
 *      `src/lib/content` + `src/lib/notifications/activity.ts`).
 *   2. `listRecentBrandUpdates` (the four brand-kit tables) — was
 *      the entire content of the old `/brand-kit/activity` page; we
 *      keep it as a *source* and surface it through the same feed.
 *
 * The aggregate is intentionally a simple in-memory merge after two
 * queries so the SQL stays auditable. When activity per workspace
 * crosses ~10k rows we push the merge into SQL via a CTE; until then
 * the JS merge is the more readable implementation.
 *
 * Filters:
 *   - `scope`  : 'all' | 'content' | 'review' | 'brand_kit' | 'planning' | 'publication'
 *   - `actor`  : optional user.id (events created by that actor)
 *   - `before` : optional Date — only include events at-or-after this point
 *                (used for "last 30 days" affordances; `all-time` keeps it open)
 *   - `limit`  : rows to return (page size + 1 to detect "hasNext")
 *   - `cursor` : optional `createdAt` ISO timestamp — events strictly
 *                older than this; key-set pagination, no OFFSET
 */

export type ActivityScope =
  "all" | "content" | "review" | "brand_kit" | "planning" | "publication" | "settings" | "team";

export interface WorkspaceActivityRow {
  /** Stable id from the source row. */
  id: string;
  at: Date;
  kind: string;
  summary: string;
  /** Group the row belongs to; drives the filter chips. */
  scope: ActivityScope;
  /** Optional human-readable target (e.g. "Spring drop — reel"). */
  targetLabel: string;
  /** Optional deep link to the source row. */
  href: string | null;
  /** Actor performing the change. */
  actor: {
    id: string | null;
    name: string | null;
    email: string | null;
  } | null;
}

export interface ListWorkspaceActivityFilters {
  scope?: ActivityScope;
  actorId?: string;
  /** Lower bound on event timestamp. */
  before?: Date;
  /** Upper bound; same as `before` but inclusive in the opposite direction. */
  after?: Date;
  /** Page size. */
  limit?: number;
  /** Cursor — return events with `at < cursor`. */
  cursor?: Date;
}

const DEFAULT_LIMIT = 50;

export interface ListWorkspaceActivityResult {
  rows: WorkspaceActivityRow[];
  /** True if more rows exist beyond the returned slice. */
  hasNext: boolean;
  /** Cursor for the next page (= last row's `at`). */
  nextCursor: Date | null;
}

/**
 * Map an `activity_kind` from `activity_event.kind` to the scope chip
 * the toolbar uses. Keeping this in one place lets us re-bucket without
 * rewriting the activity row data — the chip column depends on the
 * kind, not on the table that stored it.
 */
function kindToScope(kind: string): ActivityScope {
  switch (kind) {
    case "content_copy_patched":
    case "bulk_delete":
    case "schedule_change":
    case "update":
    case "create":
    case "delete":
    case "restore":
      return "content";
    case "review":
    case "approval":
    case "approval_reset":
    case "changes_requested":
      return "review";
    case "assignment":
      return "planning";
    case "delivery":
    case "publication":
      return "publication";
    case "invitation":
    case "ai_assistance":
    case "system":
    case "status_transition":
    case "comment":
    case "archive":
    default:
      return "content";
  }
}

/**
 * Build the in-workspace deep link for an `activity_event` row.
 * `null` when the link would be misleading (e.g. deleted target).
 */
function buildActivityHref(args: {
  workspaceSlug: string;
  contentItemId: string | null;
  kind: string;
  summary: string;
}): string | null {
  const { workspaceSlug, contentItemId, kind } = args;
  if (!contentItemId) return null;
  // We default the most-common locations. New kinds slot in here as the
  // kind vocabulary grows.
  switch (kind) {
    case "review":
    case "approval":
    case "changes_requested":
      return `/app/w/${workspaceSlug}/reviews/${contentItemId}`;
    case "publication":
    case "delivery":
      return `/app/w/${workspaceSlug}/calendar?item=${contentItemId}`;
    case "comment":
      return `/app/w/${workspaceSlug}/planning/${contentItemId}#discussion`;
    case "ai_assistance":
      return `/app/w/${workspaceSlug}/planning/${contentItemId}?tab=ai`;
    default:
      return `/app/w/${workspaceSlug}/planning/${contentItemId}`;
  }
}

export async function listWorkspaceActivity(
  workspace: { id: string; slug: string },
  filters: ListWorkspaceActivityFilters = {},
): Promise<ListWorkspaceActivityResult> {
  const limit = Math.max(1, Math.min(filters.limit ?? DEFAULT_LIMIT, 200));
  const cursor = filters.cursor ?? null;

  // ── Source A: activity_event ──────────────────────────────────────────
  const aeConditions = [eq(activityEvents.workspaceId, workspace.id)];
  if (filters.actorId) {
    aeConditions.push(eq(activityEvents.actorId, filters.actorId));
  }
  if (filters.after) {
    aeConditions.push(sql`${activityEvents.createdAt} >= ${filters.after.toISOString()}`);
  }
  if (filters.before) {
    aeConditions.push(sql`${activityEvents.createdAt} <= ${filters.before.toISOString()}`);
  }
  if (cursor) {
    aeConditions.push(sql`${activityEvents.createdAt} < ${cursor.toISOString()}`);
  }

  const aeRowsPromise = db
    .select({
      id: activityEvents.id,
      kind: activityEvents.kind,
      summary: activityEvents.summary,
      contentItemId: activityEvents.contentItemId,
      actorId: activityEvents.actorId,
      actorName: users.displayName,
      actorEmail: users.email,
      createdAt: activityEvents.createdAt,
      contentItemTitle: contentItems.title,
      // We grab the content item scope to give the planning chip a
      // stable mapping: if the linked item is a plan/idea we still
      // group as "content" today (the chip vocabulary doesn't
      // distinguish a plan from a post — content *is* what we have).
    })
    .from(activityEvents)
    .leftJoin(users, eq(users.id, activityEvents.actorId))
    .leftJoin(contentItems, eq(contentItems.id, activityEvents.contentItemId))
    .where(and(...aeConditions))
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit + 1);

  // ── Source B: brand-kit aggregate (kept as a separate source so a
  //    future 'brand_kit' scope can be filtered to just this source) ─
  const brandKitPromise = listRecentBrandUpdates(workspace.id, limit + 1).then((rows) =>
    rows.map<WorkspaceActivityRow>((r) => ({
      id: `brand:${r.kind}:${r.updatedAt.toISOString()}:${r.description}`,
      at: r.updatedAt,
      kind: `brand.${r.kind}`,
      summary: r.description,
      scope: "brand_kit",
      targetLabel: r.kind,
      href: `/${workspace.slug}#brand-kit`,
      // brandUpdates does not yet carry an actorId; left null until
      // the brand-kit schema gains one (the brand-kit activity is
      // already actor-tracked via security_audit_event).
      actor: {
        id: null,
        name: null,
        email: null,
      },
    })),
  );

  const [aeRaw, brandRaw] = await Promise.all([aeRowsPromise, brandKitPromise]);

  // Apply the cursor to the brand-kit rows: brand-kit rows sit "outside"
  // the activity_event cursor because they live in their own tables.
  // Keeping the same contract as the activity table means the merged
  // feed is monotonic regardless of source.
  const brandFiltered = cursor ? brandRaw.filter((r) => r.at < cursor) : brandRaw;

  const aeMerged: WorkspaceActivityRow[] = aeRaw.map((row) => ({
    id: row.id,
    at: row.createdAt,
    kind: row.kind,
    summary: row.summary,
    scope: kindToScope(row.kind),
    targetLabel: row.contentItemTitle ?? "(deleted item)",
    href: buildActivityHref({
      workspaceSlug: workspace.slug,
      contentItemId: row.contentItemId,
      kind: row.kind,
      summary: row.summary,
    }),
    actor: row.actorId
      ? {
          id: row.actorId,
          name: row.actorName,
          email: row.actorEmail,
        }
      : null,
  }));

  const combined = [...aeMerged, ...brandFiltered];
  combined.sort((a, b) => b.at.getTime() - a.at.getTime());

  const scoped =
    filters.scope && filters.scope !== "all"
      ? combined.filter((row) => row.scope === filters.scope)
      : combined;

  const rows = scoped.slice(0, limit);
  const hasNext = scoped.length > limit;
  // Indexing `rows` directly returns `T | undefined` under
  // `noUncheckedIndexedAccess`; the explicit nullish escape makes the
  // cursor accessible even when `rows` is empty.
  const last = rows.length > 0 ? rows[rows.length - 1] : null;
  const nextCursor = last ? last.at : null;

  return { rows, hasNext, nextCursor };
}

/**
 * Activity group counts for the chip row.
 *
 * Cheap variant: tag each row with its scope, then count. Avoids a
 * second query per chip. Use `listWorkspaceActivity` with a generous
 * limit for the totals.
 *
 * This deliberately does NOT include the unfiltered count for "All";
 * if the surface has < 5000 rows total the empty page renders the
 * big chip ("All 124") correctly. If that ceiling is breached we
 * switch to a server-side GROUP BY.
 */
export interface ActivityScopeCounts {
  all: number;
  content: number;
  review: number;
  brand_kit: number;
  planning: number;
  publication: number;
}

export async function listWorkspaceActivityCounts(
  workspace: { id: string; slug: string },
  filters: { actorId?: string; after?: Date; before?: Date } = {},
): Promise<ActivityScopeCounts> {
  // Reuse the aggregate with a generous limit. The merge runs once,
  // scope counts are derived in JS.
  const { rows } = await listWorkspaceActivity(workspace, {
    ...filters,
    limit: 5_000,
  });
  const c: ActivityScopeCounts = {
    all: rows.length,
    content: 0,
    review: 0,
    brand_kit: 0,
    planning: 0,
    publication: 0,
  };
  for (const row of rows) {
    switch (row.scope) {
      case "content":
      case "settings":
      case "team":
        c.content++;
        break;
      case "review":
        c.review++;
        break;
      case "brand_kit":
        c.brand_kit++;
        break;
      case "planning":
        c.planning++;
        break;
      case "publication":
        c.publication++;
        break;
      case "all":
        // 'all' is a UI-only filter value; activity rows are never
        // stamped with scope='all'. Skip silently to keep the
        // exhaustive switch accurate.
        break;
    }
  }
  return c;
}

/**
 * Lookup workspace by slug — used to render the page from a slug-only
 * URL. Kept here (not in `brand/service.ts`) so the workspace-activity
 * surface owns its own access path.
 */
export async function getWorkspaceBySlug(slug: string) {
  const rows = await db
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      agencyId: workspaces.agencyId,
    })
    .from(workspaces)
    .where(eq(workspaces.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

/* Re-export the membership-related helpers we still occasionally need at
   the import path `lib/workspace-activity/service.ts` (i.e. when a
   caller wants the workspace + the active membership together). */
export { workspaceMemberships, workspaceMembershipRoles };
