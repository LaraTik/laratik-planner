import "server-only";
import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentAssignments,
  contentItemChannels,
  contentItems,
  socialChannels,
  users,
  workspaceMembershipRoles,
  workspaceMemberships as wsMemberships,
} from "@/lib/db/schema";
import {
  canAccessInternalWorkspace,
  hasWorkspaceRole,
  INTERNAL_WORKSPACE_ROLES,
  requirePolicy,
  type Actor,
} from "@/lib/auth/policy";

// ─── Read helpers ────────────────────────────────────────────────────────
export async function getContentItem(actor: Actor, contentItemId: string) {
  const [row] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!row) return null;

  // Internal detail includes private strategy, assignments and review data.
  // Client reviewers use dedicated, allow-listed queries in the client portal.
  await requirePolicy(canAccessInternalWorkspace(actor, row.workspaceId), "view_content");

  const [channels, assignments] = await Promise.all([
    db
      .select({
        id: contentItemChannels.id,
        socialChannelId: contentItemChannels.socialChannelId,
        accountName: socialChannels.accountName,
        platform: socialChannels.platform,
        socialConnectionId: socialChannels.socialConnectionId,
        externalAccountId: socialChannels.externalAccountId,
        connectionStatus: socialChannels.connectionStatus,
        plannedPublishAtOverride: contentItemChannels.plannedPublishAtOverride,
      })
      .from(contentItemChannels)
      .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
      .where(eq(contentItemChannels.contentItemId, contentItemId))
      .orderBy(asc(socialChannels.platform), asc(socialChannels.accountName)),
    db
      .select({
        id: contentAssignments.id,
        assignmentType: contentAssignments.assignmentType,
        userId: contentAssignments.userId,
        active: contentAssignments.active,
      })
      .from(contentAssignments)
      .where(eq(contentAssignments.contentItemId, contentItemId)),
  ]);

  return { ...row, channels, assignments };
}

export async function listWorkspaceContent(
  actor: Actor,
  workspaceId: string,
  opts: {
    monthStart?: Date;
    monthEnd?: Date;
    status?: string;
    limit?: number;
    /**
     * FEAT-09 (GAP-FULL-REVIEW-2026-08-25) — new filters for the
     * planning list. All optional; missing means "no filter on this
     * field". Search is case-insensitive and matches either title or
     * brief. `format` must be one of the values declared in
     * `QuickCreateSchema`; `ownerId` is the content owner (the row
     * that drives the assignee column on the list).
     */
    search?: string;
    ownerId?: string;
    format?: string;
    /**
     * Cursor-based pagination. The cursor is the
     * `{ plannedPublishAt, id }` of the last item from the previous
     * page. The next page returns rows whose
     * `(plannedPublishAt, id)` tuple is strictly greater, so the
     * ordering is stable even when many items share the same
     * publish date.
     */
    cursor?: { plannedPublishAt: Date; id: string };
    /**
     * Offset-based pagination. Mutually exclusive with `cursor` —
     * if both are provided, the cursor wins (it's the more
     * efficient path for large datasets). Use this when the UI
     * needs page-based navigation (e.g. "page 3 of 12").
     */
    offset?: number;
  } = {},
) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "list_content",
  );

  const conditions = [eq(contentItems.workspaceId, workspaceId), isNull(contentItems.archivedAt)];
  if (opts.monthStart) conditions.push(sql`${contentItems.plannedPublishAt} >= ${opts.monthStart}`);
  if (opts.monthEnd) conditions.push(sql`${contentItems.plannedPublishAt} < ${opts.monthEnd}`);
  if (opts.status) conditions.push(sql`${contentItems.status} = ${opts.status}`);
  if (opts.ownerId) conditions.push(eq(contentItems.contentOwnerId, opts.ownerId));
  if (opts.format) {
    // Cast at the SQL boundary — the page has already validated the
    // string against the ContentFormat enum before passing it in.
    conditions.push(eq(contentItems.format, opts.format as never));
  }
  if (opts.cursor) {
    // Compound keyset condition: same plannedPublishAt but a later
    // id, or a strictly later plannedPublishAt. Keeps the page
    // boundary stable when two items share a publish date.
    const c = opts.cursor;
    conditions.push(
      sql`(${contentItems.plannedPublishAt} > ${c.plannedPublishAt}) OR (${contentItems.plannedPublishAt} = ${c.plannedPublishAt} AND ${contentItems.id} > ${c.id})`,
    );
  }
  if (opts.search) {
    const needle = `%${opts.search.toLowerCase()}%`;
    // ilike is case-insensitive in Postgres; lower(title) keeps the
    // path index-friendly for short queries.
    conditions.push(
      sql`(lower(${contentItems.title}) LIKE ${needle} OR lower(${contentItems.brief}) LIKE ${needle})`,
    );
  }

  // Offset path. We apply it AFTER the cursor is resolved (they're
  // mutually exclusive; the cursor path is the historical one and
  // the offset path is the new page-based one). An offset past the
  // dataset returns an empty array.
  const offset = opts.offset && opts.offset > 0 ? opts.offset : 0;
  return db
    .select()
    .from(contentItems)
    .where(and(...conditions))
    .orderBy(sql`${contentItems.plannedPublishAt} ASC`, sql`${contentItems.id} ASC`)
    .limit(opts.limit ?? 200)
    .offset(offset);
}

/**
 * Return a bounded, workspace-authorized workload summary for one period.
 * Names are limited to display names: email addresses and membership details
 * are not needed to explain assignment distribution to workspace planners.
 */
export async function getWorkspaceWorkloadSummary(
  actor: Actor,
  workspaceId: string,
  input: { monthStart: Date; monthEnd: Date; limit?: number },
) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "view_content_workload",
  );
  const conditions = [
    eq(contentItems.workspaceId, workspaceId),
    isNull(contentItems.archivedAt),
    sql`${contentItems.plannedPublishAt} >= ${input.monthStart}`,
    sql`${contentItems.plannedPublishAt} < ${input.monthEnd}`,
  ];
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 50);
  const [totalRow, owners, designers] = await Promise.all([
    db
      .select({ itemCount: count() })
      .from(contentItems)
      .where(and(...conditions))
      .then((rows) => rows[0]),
    db
      .select({ displayName: users.displayName, itemCount: count() })
      .from(contentItems)
      .leftJoin(users, eq(users.id, contentItems.contentOwnerId))
      .where(and(...conditions))
      .groupBy(contentItems.contentOwnerId, users.displayName)
      .orderBy(desc(count()), asc(users.displayName))
      .limit(limit + 1),
    db
      .select({ displayName: users.displayName, itemCount: count() })
      .from(contentItems)
      .leftJoin(users, eq(users.id, contentItems.designerId))
      .where(and(...conditions))
      .groupBy(contentItems.designerId, users.displayName)
      .orderBy(desc(count()), asc(users.displayName))
      .limit(limit + 1),
  ]);
  const shapeAssignments = (rows: typeof owners) => ({
    members: rows.slice(0, limit).map((row) => ({
      name: row.displayName ?? "Unassigned",
      itemCount: row.itemCount,
    })),
    omittedMemberGroups: Math.max(rows.length - limit, 0),
  });
  return {
    totalItems: totalRow?.itemCount ?? 0,
    contentOwners: shapeAssignments(owners),
    designers: shapeAssignments(designers),
    bounded: owners.length > limit || designers.length > limit,
  };
}

/**
 * Count workspace content items matching the same filter set as
 * `listWorkspaceContent` (minus pagination, which is irrelevant for a
 * count). Used by the planning list to render the "Showing X–Y of Z"
 * total and to compute the total page count for the pagination
 * control. Two queries (rows + count) is the standard pagination
 * pattern; both are indexed on `workspaceId` + `plannedPublishAt`
 * via the existing content_item indexes, so the cost is one extra
 * fast scan per page load.
 */
export async function countWorkspaceContent(
  actor: Actor,
  workspaceId: string,
  opts: {
    monthStart?: Date;
    monthEnd?: Date;
    status?: string;
    search?: string;
    ownerId?: string;
    format?: string;
  } = {},
): Promise<number> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "count_content",
  );
  const conditions = [eq(contentItems.workspaceId, workspaceId), isNull(contentItems.archivedAt)];
  if (opts.monthStart) conditions.push(sql`${contentItems.plannedPublishAt} >= ${opts.monthStart}`);
  if (opts.monthEnd) conditions.push(sql`${contentItems.plannedPublishAt} < ${opts.monthEnd}`);
  if (opts.status) conditions.push(sql`${contentItems.status} = ${opts.status}`);
  if (opts.ownerId) conditions.push(eq(contentItems.contentOwnerId, opts.ownerId));
  if (opts.format) {
    conditions.push(eq(contentItems.format, opts.format as never));
  }
  if (opts.search) {
    const needle = `%${opts.search.toLowerCase()}%`;
    conditions.push(
      sql`(lower(${contentItems.title}) LIKE ${needle} OR lower(${contentItems.brief}) LIKE ${needle})`,
    );
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(and(...conditions));
  return row?.count ?? 0;
}

/**
 * FEAT-12 (GAP-FULL-REVIEW-2026-08-25) — the "Unassigned Design Queue"
 * page (§3 Stitch frame, master prompt §14 `listUnassignedDesignWork`).
 *
 * Returns content items that:
 *   1. live in the given workspace,
 *   2. are NOT archived,
 *   3. are in `approved_for_design` (the §10 state where a designer
 *      may claim them), and
 *   4. have no `designer_id` set.
 *
 * Ordered by `planned_publish_at` ascending so the items the team is
 * about to ship float to the top. The `status` / `limit` / `cursor`
 * options are parity with `listWorkspaceContent` so the page can page
 * through a large backlog without rewriting the listing code.
 *
 * The role gate is the same `INTERNAL_WORKSPACE_ROLES` set the planning
 * list uses — a client reviewer must never see this surface (their
 * counterpart is the `client/...` portal).
 */
export interface ListUnassignedDesignWorkOptions {
  status?: string;
  limit?: number;
  cursor?: { plannedPublishAt: Date; id: string };
}

export async function listUnassignedDesignWork(
  actor: Actor,
  workspaceId: string,
  opts: ListUnassignedDesignWorkOptions = {},
) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "list_unassigned_design_work",
  );

  const conditions = [
    eq(contentItems.workspaceId, workspaceId),
    isNull(contentItems.archivedAt),
    isNull(contentItems.designerId),
    // `status` is a pg enum; the page has already validated the
    // string against the allowed values before passing it in.
    eq(contentItems.status, (opts.status ?? "approved_for_design") as never),
  ];
  if (opts.cursor) {
    const c = opts.cursor;
    conditions.push(
      sql`(${contentItems.plannedPublishAt} > ${c.plannedPublishAt}) OR (${contentItems.plannedPublishAt} = ${c.plannedPublishAt} AND ${contentItems.id} > ${c.id})`,
    );
  }

  return db
    .select()
    .from(contentItems)
    .where(and(...conditions))
    .orderBy(sql`${contentItems.plannedPublishAt} ASC`, sql`${contentItems.id} ASC`)
    .limit(opts.limit ?? 200);
}

// ─── Designer roster (FEAT-FULL-REVIEW-2026-08-26) ─────────────────────
//
// `assignDesigner` (the §14 manager-driven path) needs to know which
// designers exist in a workspace so the picker can offer real
// candidates. We pull active memberships with the `designer` role
// and join `users` for the human label.
//
// The same query is reusable from the publish / design-queue pages
// if they ever need a "task owner" picker. Returns `displayName`
// when set, otherwise `name`, otherwise a short id slice — same
// precedence the planning list owner dropdown uses
// (`src/app/(app)/app/a/[agencySlug]/w/[slug]/planning/page.tsx`).

export async function listWorkspaceDesigners(
  actor: Actor,
  workspaceId: string,
): Promise<{ id: string; label: string }[]> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "list_designers",
  );
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      name: users.name,
    })
    .from(workspaceMembershipRoles)
    .innerJoin(wsMemberships, eq(wsMemberships.id, workspaceMembershipRoles.workspaceMembershipId))
    .innerJoin(users, eq(users.id, wsMemberships.userId))
    .where(
      and(
        eq(wsMemberships.workspaceId, workspaceId),
        eq(wsMemberships.status, "active"),
        eq(workspaceMembershipRoles.role, "designer"),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.name));
  return rows.map((r) => ({
    id: r.id,
    label: r.displayName ?? r.name ?? r.id.slice(0, 8),
  }));
}
