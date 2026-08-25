import "server-only";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItemChannels, contentItems, workspaceSettings } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { calculateOverviewMetrics, type KpiContentFormat, type KpiContentStatus } from "./kpis";

/**
 * FEAT-19 (GAP-FULL-REVIEW-2026-08-25) — filter-aware overview
 * metrics.
 *
 * Master prompt §11: "KPI cards apply filters." The pre-fix
 * workspace overview always summarised the whole workspace month
 * regardless of the filters the user had selected in the planning
 * list. The pure `calculateOverviewMetrics` calculator in
 * `kpis.ts` is unchanged — it operates on whatever rows it is
 * given. This module is the data-side companion that pulls a
 * filtered set of rows and feeds them into the calculator.
 *
 * Filter shape mirrors `listWorkspaceContent` in
 * `src/lib/content/service.ts` so the page can re-use the URL
 * query state. New fields (`channelId[]`, `campaignId`,
 * `pillarId`, `designerId`) are additive; the planning list
 * doesn't accept them yet (FEAT-09 partial) but the overview
 * does.
 */

export type OverviewFilterOptions = {
  monthStart?: Date;
  monthEnd?: Date;
  status?: string;
  format?: string;
  ownerId?: string;
  designerId?: string;
  campaignId?: string;
  pillarId?: string;
  channelIds?: string[];
};

/**
 * Compute the workspace overview metrics for a filtered subset of
 * content items. The role gate is `INTERNAL_WORKSPACE_ROLES` —
 * client reviewers see a separate client-side surface and must
 * not be able to query the internal KPI counts.
 *
 * Implementation note: the `channelIds` filter joins
 * `content_item_channels`. The SQL is `EXISTS (... WHERE
 * social_channel_id IN (...))` so a content item that has at
 * least one matching channel qualifies. The overview doesn't
 * care WHICH channels matched — coverage and delivery health
 * are item-level, not channel-level.
 */
export async function getFilteredOverviewMetrics(
  actor: Actor,
  workspaceId: string,
  filters: OverviewFilterOptions = {},
): Promise<ReturnType<typeof calculateOverviewMetrics>> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
      "viewer",
    ]),
    "overview_metrics",
  );

  const conditions = [eq(contentItems.workspaceId, workspaceId), isNull(contentItems.archivedAt)];
  if (filters.monthStart) {
    conditions.push(sql`${contentItems.plannedPublishAt} >= ${filters.monthStart}`);
  }
  if (filters.monthEnd) {
    conditions.push(sql`${contentItems.plannedPublishAt} < ${filters.monthEnd}`);
  }
  if (filters.status) {
    conditions.push(sql`${contentItems.status} = ${filters.status}`);
  }
  if (filters.ownerId) {
    conditions.push(eq(contentItems.contentOwnerId, filters.ownerId));
  }
  if (filters.designerId) {
    conditions.push(eq(contentItems.designerId, filters.designerId));
  }
  if (filters.format) {
    conditions.push(eq(contentItems.format, filters.format as never));
  }
  if (filters.campaignId) {
    conditions.push(eq(contentItems.campaignId, filters.campaignId));
  }
  if (filters.pillarId) {
    conditions.push(eq(contentItems.contentPillarId, filters.pillarId));
  }
  if (filters.channelIds && filters.channelIds.length > 0) {
    // EXISTS subquery: keep the rows that have at least one
    // matching `content_item_channels` row. IN (SELECT ...) is
    // equivalent and just as fast for the sizes the overview
    // sees; we use EXISTS so the planner can short-circuit on
    // the first hit per content item.
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${contentItemChannels}
        WHERE ${contentItemChannels.contentItemId} = ${contentItems.id}
          AND ${contentItemChannels.socialChannelId} IN ${inArray(
            contentItemChannels.socialChannelId,
            filters.channelIds,
          )}
      )`,
    );
  }

  const [rows, settings] = await Promise.all([
    db
      .select({
        status: contentItems.status,
        format: contentItems.format,
        plannedPublishAt: contentItems.plannedPublishAt,
      })
      .from(contentItems)
      .where(and(...conditions)),
    db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1),
  ]);

  const monthlyTarget = settings[0]?.monthlyTarget ?? null;
  return calculateOverviewMetrics({
    now: new Date(),
    monthlyTarget,
    items: rows.map((r) => ({
      status: r.status as KpiContentStatus,
      format: r.format as KpiContentFormat,
      plannedPublishAt: r.plannedPublishAt,
    })),
  });
}

/**
 * Re-export the inner calculator so a page that already has the
 * raw rows (e.g. the legacy overview that pulls them inline) can
 * import the calculator from a single path. Keeps the import
 * surface small.
 */
export { calculateOverviewMetrics } from "./kpis";
export type { KpiContentFormat, KpiContentStatus };

// silence unused — `lt` / `gte` are reserved for future range
// helpers (e.g. "show items planned in the next 7 days"); the
// current filter shape uses `monthStart` / `monthEnd` to keep
// parity with `listWorkspaceContent`.
void lt;
void gte;
