/**
 * Enriched planning-list query.
 *
 * The basic `listWorkspaceContent` returns one row per content item
 * with no joins. The enriched planning-list UI needs more — owner
 * name, channel icons, comment count, asset count, delivery count,
 * open approval count, health rollup, next-action hint — without
 * doing N+1 round-trips per row.
 *
 * Strategy: one query per concern, executed in parallel after the
 * page query lands. The 6 fan-out queries are bounded by the page
 * size (20 by default), so the cost is `O(6 * pageSize)` indexed
 * lookups instead of `O(6 * pageSize^2)`. Postgres handles this in
 * single-digit milliseconds for 20 rows.
 *
 * The output shape (`EnrichedContentItem`) is the single contract
 * for the row component. Future list variants (board, calendar,
 * design queue) can call the same function and reuse the row
 * component as long as they fill in the same shape.
 */

import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  approvalRequests,
  attachments,
  comments,
  contentItemChannels,
  contentItems,
  deliveryVersions,
  socialChannels,
  users,
} from "@/lib/db/schema";
import { classifyHealth, daysOverdue, type HealthSnapshot } from "@/lib/dashboard/health";
import { deriveNextAction, type ActorRoles, type NextAction } from "@/lib/content/next-action";
import { getWorkspaceRoles, hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { INTERNAL_WORKSPACE_ROLES } from "@/lib/auth/policy";
import type { ContentStatus, ContentFormat } from "@/lib/content/status";

export interface EnrichedOwner {
  id: string;
  name: string;
  /** displayName is NOT NULL in the schema (DB before-insert trigger fills it), but the TS type is nullable for safety. */
  displayName: string;
  avatarPath: string | null;
}

export interface EnrichedChannel {
  id: string;
  platform: string;
  accountName: string;
}

export interface EnrichedContentItem {
  id: string;
  title: string;
  format: ContentFormat;
  status: ContentStatus;
  plannedPublishAt: Date;
  brief: string;
  priority: string;
  blockedReason: string | null;
  cancellationReason: string | null;
  changeRequestGate: string | null;
  owner: EnrichedOwner | null;
  designer: EnrichedOwner | null;
  channels: EnrichedChannel[];
  commentCount: number;
  assetCount: number;
  deliveryCount: number;
  hasApprovedDelivery: boolean;
  openApprovalCount: number;
  health: HealthSnapshot;
  overdueDays: number;
  nextAction: NextAction;
}

export interface ListEnrichedOptions {
  monthStart?: Date;
  monthEnd?: Date;
  status?: string;
  search?: string;
  ownerId?: string;
  format?: string;
  /** Health filter — accepts one or more `HealthSnapshot` values. */
  healthIn?: readonly HealthSnapshot[];
  limit?: number;
  offset?: number;
  /** Cursor for keyset pagination. When set, used in place of `offset`. */
  cursor?: { plannedPublishAt: Date; id: string };
}

export interface ListEnrichedResult {
  items: EnrichedContentItem[];
  /** Total matched rows ignoring `healthIn` (used for the "Showing X–Y of Z" line). */
  total: number;
}

/**
 * Resolve the actor's role set within the workspace. Reuses the
 * `getWorkspaceRoles` cache from `@/lib/auth/policy` (which is
 * already React.cache-wrapped and used by every permission check on
 * the page) so the next-action hint for every row uses the same
 * role context without an extra DB call.
 *
 * The role set is `Set<WorkspaceRole>` (de-duped). Empty set means
 * the actor has no internal workspace role (client reviewer or
 * outside observer) — the next-action hint will be passive.
 */
export async function resolveActorRoles(actor: Actor, workspaceId: string): Promise<ActorRoles> {
  const roleSet = await getWorkspaceRoles(actor, workspaceId);
  return Array.from(roleSet) as ActorRoles;
}

export async function listWorkspaceContentEnriched(
  actor: Actor,
  workspaceId: string,
  opts: ListEnrichedOptions,
  now: Date,
  actorRoles: ActorRoles,
): Promise<ListEnrichedResult> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "list_content",
  );

  const conditions = [eq(contentItems.workspaceId, workspaceId), isNull(contentItems.archivedAt)];
  if (opts.monthStart) {
    conditions.push(sql`${contentItems.plannedPublishAt} >= ${opts.monthStart}`);
  }
  if (opts.monthEnd) {
    conditions.push(sql`${contentItems.plannedPublishAt} < ${opts.monthEnd}`);
  }
  if (opts.status) {
    conditions.push(sql`${contentItems.status} = ${opts.status}`);
  }
  if (opts.ownerId) {
    conditions.push(eq(contentItems.contentOwnerId, opts.ownerId));
  }
  if (opts.format) {
    conditions.push(eq(contentItems.format, opts.format as never));
  }
  if (opts.search) {
    const needle = `%${opts.search.toLowerCase()}%`;
    conditions.push(
      sql`(lower(${contentItems.title}) LIKE ${needle} OR lower(${contentItems.brief}) LIKE ${needle})`,
    );
  }
  if (opts.cursor) {
    const c = opts.cursor;
    conditions.push(
      sql`(${contentItems.plannedPublishAt} > ${c.plannedPublishAt}) OR (${contentItems.plannedPublishAt} = ${c.plannedPublishAt} AND ${contentItems.id} > ${c.id})`,
    );
  }
  const offset = opts.offset && opts.offset > 0 ? opts.offset : 0;
  const limit = opts.limit ?? 20;

  // Query 1 — base content_item rows, joined to owner + designer.
  const baseRows = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      format: contentItems.format,
      status: contentItems.status,
      plannedPublishAt: contentItems.plannedPublishAt,
      brief: contentItems.brief,
      priority: contentItems.priority,
      blockedReason: contentItems.blockedReason,
      cancellationReason: contentItems.cancellationReason,
      changeRequestGate: contentItems.changeRequestGate,
      ownerId: contentItems.contentOwnerId,
      ownerName: users.name,
      ownerDisplayName: users.displayName,
      ownerAvatarPath: users.avatarPath,
      designerId: contentItems.designerId,
    })
    .from(contentItems)
    .leftJoin(users, eq(users.id, contentItems.contentOwnerId))
    .where(and(...conditions))
    .orderBy(asc(contentItems.plannedPublishAt), asc(contentItems.id))
    .limit(limit)
    .offset(offset);

  if (baseRows.length === 0) {
    return { items: [], total: 0 };
  }

  const ids = baseRows.map((r) => r.id);

  // Queries 2..6 — fan-out per concern. Each is one indexed lookup
  // bounded by `IN (ids)` with at most `limit` ids, so the cost is
  // proportional to the page size, not to the workspace size.
  const [designerRows, channelRows, commentRows, attachmentRows, deliveryRows, approvalRows] =
    await Promise.all([
      db
        .select({
          id: users.id,
          name: users.name,
          displayName: users.displayName,
          avatarPath: users.avatarPath,
        })
        .from(users)
        .where(
          inArray(
            users.id,
            baseRows.map((r) => r.designerId).filter((id): id is string => id !== null),
          ),
        ),
      db
        .select({
          contentItemId: contentItemChannels.contentItemId,
          channelId: socialChannels.id,
          platform: socialChannels.platform,
          accountName: socialChannels.accountName,
        })
        .from(contentItemChannels)
        .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
        .where(inArray(contentItemChannels.contentItemId, ids)),
      db
        .select({
          contentItemId: comments.contentItemId,
          count: sql<number>`count(*)::int`,
        })
        .from(comments)
        .where(inArray(comments.contentItemId, ids))
        .groupBy(comments.contentItemId),
      db
        .select({
          contentItemId: attachments.contentItemId,
          count: sql<number>`count(*)::int`,
        })
        .from(attachments)
        .where(inArray(attachments.contentItemId, ids))
        .groupBy(attachments.contentItemId),
      db
        .select({
          contentItemId: deliveryVersions.contentItemId,
          count: sql<number>`count(*)::int`,
          approvedCount: sql<number>`count(*) FILTER (WHERE ${deliveryVersions.isFinalApproved})::int`,
        })
        .from(deliveryVersions)
        .where(inArray(deliveryVersions.contentItemId, ids))
        .groupBy(deliveryVersions.contentItemId),
      db
        .select({
          contentItemId: approvalRequests.contentItemId,
          count: sql<number>`count(*)::int`,
        })
        .from(approvalRequests)
        .where(
          and(inArray(approvalRequests.contentItemId, ids), eq(approvalRequests.status, "pending")),
        )
        .groupBy(approvalRequests.contentItemId),
    ]);

  // Index by contentItemId for O(1) merge.
  const designerById = new Map<string, EnrichedOwner>();
  for (const r of designerRows) {
    designerById.set(r.id, {
      id: r.id,
      name: r.name ?? "",
      displayName: r.displayName ?? r.name ?? r.id,
      avatarPath: r.avatarPath,
    });
  }
  const channelsByItem = new Map<string, EnrichedChannel[]>();
  for (const r of channelRows) {
    const list = channelsByItem.get(r.contentItemId) ?? [];
    list.push({ id: r.channelId, platform: r.platform, accountName: r.accountName });
    channelsByItem.set(r.contentItemId, list);
  }
  const countBy = (rows: { contentItemId: string | null; count: number }[]) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.contentItemId) m.set(r.contentItemId, r.count);
    }
    return m;
  };
  const commentCount = countBy(commentRows);
  const assetCount = countBy(attachmentRows);
  const deliveryCount = new Map<string, number>();
  const approvedDeliveryCount = new Map<string, number>();
  for (const r of deliveryRows) {
    deliveryCount.set(r.contentItemId, r.count);
    approvedDeliveryCount.set(r.contentItemId, r.approvedCount);
  }
  const openApprovalCount = countBy(approvalRows);

  // Build the enriched output. The health rollup + next-action hint
  // are computed in JS (pure functions, no DB cost) so the page can
  // call them again on re-render without re-querying.
  const items: EnrichedContentItem[] = baseRows.map((r) => {
    const owner: EnrichedOwner | null = r.ownerId
      ? {
          id: r.ownerId,
          name: r.ownerName ?? "",
          displayName: r.ownerDisplayName ?? r.ownerName ?? r.ownerId,
          avatarPath: r.ownerAvatarPath,
        }
      : null;
    const designer = r.designerId ? (designerById.get(r.designerId) ?? null) : null;
    const health = classifyHealth({
      status: r.status as ContentStatus,
      plannedPublishAt: r.plannedPublishAt,
      now,
    });
    const overdueDays = daysOverdue({ plannedPublishAt: r.plannedPublishAt, now });
    const nextAction = deriveNextAction({
      status: r.status as ContentStatus,
      health,
      openApprovalCount: openApprovalCount.get(r.id) ?? 0,
      actorRoles,
      now,
      plannedPublishAt: r.plannedPublishAt,
    });
    return {
      id: r.id,
      title: r.title,
      format: r.format as ContentFormat,
      status: r.status as ContentStatus,
      plannedPublishAt: r.plannedPublishAt,
      brief: r.brief,
      priority: r.priority,
      blockedReason: r.blockedReason,
      cancellationReason: r.cancellationReason,
      changeRequestGate: r.changeRequestGate,
      owner,
      designer,
      channels: channelsByItem.get(r.id) ?? [],
      commentCount: commentCount.get(r.id) ?? 0,
      assetCount: assetCount.get(r.id) ?? 0,
      deliveryCount: deliveryCount.get(r.id) ?? 0,
      hasApprovedDelivery: (approvedDeliveryCount.get(r.id) ?? 0) > 0,
      openApprovalCount: openApprovalCount.get(r.id) ?? 0,
      health,
      overdueDays,
      nextAction,
    };
  });

  // The `healthIn` filter is a post-process step. We do it AFTER the
  // page query so the total count returned by `countWorkspaceContent`
  // (which doesn't know about health) stays the source of truth for
  // pagination. The page renders health-filtered rows on a slice
  // that may be smaller than `limit`; that's acceptable for a
  // manager's "Needs attention" view because the dataset is small
  // and the post-filter is the documented behaviour.
  const filtered = opts.healthIn ? items.filter((i) => opts.healthIn!.includes(i.health)) : items;

  // Total is the unfiltered-by-health count so the user's pagination
  // doesn't shift when they apply the attention view.
  const total = await countWorkspaceContentEnriched(actor, workspaceId, opts);

  return { items: filtered, total };
}

async function countWorkspaceContentEnriched(
  actor: Actor,
  workspaceId: string,
  opts: ListEnrichedOptions,
): Promise<number> {
  const conditions = [eq(contentItems.workspaceId, workspaceId), isNull(contentItems.archivedAt)];
  if (opts.monthStart) {
    conditions.push(sql`${contentItems.plannedPublishAt} >= ${opts.monthStart}`);
  }
  if (opts.monthEnd) {
    conditions.push(sql`${contentItems.plannedPublishAt} < ${opts.monthEnd}`);
  }
  if (opts.status) {
    conditions.push(sql`${contentItems.status} = ${opts.status}`);
  }
  if (opts.ownerId) {
    conditions.push(eq(contentItems.contentOwnerId, opts.ownerId));
  }
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
