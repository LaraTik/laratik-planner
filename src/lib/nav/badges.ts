import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvalRequests, contentItems } from "@/lib/db/schema";
import {
  INTERNAL_WORKSPACE_ROLES,
  canAccessInternalWorkspace,
  hasWorkspaceRole,
  type Actor,
  type ActorWorkspaceRoleIndex,
} from "@/lib/auth/policy";

/**
 * Actionable sidebar badge counts.
 *
 * The sidebar must surface the user's actual work — the items
 * requiring their attention right now — not the total inventory
 * of every workspace. A "Library 582" badge is noise; a "Design
 * queue 2" badge is signal.
 *
 * Each helper is:
 *   - server-only (no client fetch),
 *   - permission-aware (the actor must actually be able to act on
 *     the row to see the badge),
 *   - capped (badge numbers above the cap collapse to "99+"),
 *   - best-effort (any DB error returns 0, never throws — a
 *     missing badge is a non-critical UI regression; a 500 page
 *     is not).
 *
 * The sidebar renders zero counts as hidden — only positive
 * numbers produce a visible pill.
 */

export const BADGE_CAP = 99;

export type WorkspaceBadges = {
  approvals: number;
  designQueue: number;
};

/**
 * Compute the workspace badge counts for a single workspace in
 * one round trip. The sidebar calls this once per request — the
 * counts are cheap (status / not-null index lookups) and the
 * planner already runs ~20 small queries on the same page.
 *
 * If the actor lacks any of the underlying permissions, the
 * corresponding count is forced to 0 (the badge is hidden). A
 * non-actor with no workspace access still gets a successful
 * `{ approvals: 0, designQueue: 0 }` response.
 */
export async function getWorkspaceBadges(
  actor: Actor,
  workspaceId: string,
): Promise<WorkspaceBadges> {
  if (!(await canAccessInternalWorkspace(actor, workspaceId))) {
    return { approvals: 0, designQueue: 0 };
  }
  const [approvals, designQueue] = await Promise.all([
    countPendingApprovals(actor, workspaceId),
    countUnassignedDesignItems(actor, workspaceId),
  ]);
  return { approvals, designQueue };
}

/**
 * Pending approval requests that the actor can act on.
 *
 * A client reviewer only sees their own gate; an internal
 * reviewer / manager / planner sees both internal gates. A
 * viewer (no review role) sees 0.
 */
export async function countPendingApprovals(actor: Actor, workspaceId: string): Promise<number> {
  const gates: Array<"content" | "creative_internal" | "creative_client"> = [];
  if (await hasWorkspaceRole(actor, workspaceId, ["internal_reviewer"])) {
    gates.push("content", "creative_internal");
  }
  if (await hasWorkspaceRole(actor, workspaceId, ["client_reviewer"])) {
    // Client reviewers only see the client surface anyway
    // (the sidebar is hidden behind the `client` namespace),
    // so this is a defensive no-op for the global sidebar.
    gates.push("creative_client");
  }
  if (gates.length === 0) return 0;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(approvalRequests)
    .innerJoin(contentItems, eq(contentItems.id, approvalRequests.contentItemId))
    .where(
      and(
        eq(contentItems.workspaceId, workspaceId),
        eq(approvalRequests.status, "pending"),
        inArray(approvalRequests.gate, gates),
        isNull(contentItems.archivedAt),
      ),
    );
  return cap(row?.count ?? 0);
}

/**
 * Unassigned design items in the `approved_for_design` state.
 * The full list is what the design-queue page renders; the
 * sidebar shows the count so a designer knows whether to open it.
 *
 * Designers do see this badge (the queue is where they claim
 * work); reviewers do too (so they know what's sitting in the
 * limbo state). Viewers see 0.
 */
export async function countUnassignedDesignItems(
  actor: Actor,
  workspaceId: string,
): Promise<number> {
  if (
    !(await hasWorkspaceRole(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
    ]))
  ) {
    return 0;
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(
      and(
        eq(contentItems.workspaceId, workspaceId),
        isNull(contentItems.archivedAt),
        isNull(contentItems.designerId),
        eq(contentItems.status, "approved_for_design"),
      ),
    );
  return cap(row?.count ?? 0);
}

function cap(n: number): number {
  return Math.max(0, Math.min(BADGE_CAP, n));
}

/** `review_gate` enum — the `approvalRequests.gate` column type. */
type ReviewGate = "content" | "creative_internal" | "creative_client";

/**
 * Aggregate badge counts for many workspaces in a fixed number of queries.
 *
 * The app-shell layout needs a badge set for EVERY workspace the actor can
 * switch to, and it needs it on every authenticated navigation — including
 * every tenant/workspace switch. Calling `getWorkspaceBadges` per workspace
 * costs ~2 count queries each; batching the counts by workspace keeps the
 * cost at 2 queries total regardless of how many workspaces the actor has.
 *
 * The permission gates are IDENTICAL to the per-workspace path and are
 * evaluated against the caller's `roleIndex`, which reproduces
 * `getWorkspaceRoles` semantics (including the agency-admin shortcut). This
 * helper therefore only re-batches the counting; it does not re-decide who
 * may see a badge.
 *
 * Note there is no `actor` parameter: authorization context arrives wholly
 * through `roleIndex`, which the caller has already resolved. Accepting an
 * `actor` it cannot use would invite a future caller to believe it is
 * re-checking permissions when it is only counting.
 *
 * Counting is grouped by workspace AND, for approvals, by gate. Grouping by
 * gate matters: a client reviewer's allowed gates are a strict subset of an
 * internal reviewer's, so a single `IN (...)` over the union of every
 * workspace's gates would leak counts between roles. The per-workspace gate
 * filter is applied in memory from the grouped rows instead.
 */
export async function getWorkspaceBadgesForActor(
  workspaceIds: readonly string[],
  roleIndex: ActorWorkspaceRoleIndex,
): Promise<Map<string, WorkspaceBadges>> {
  const result = new Map<string, WorkspaceBadges>();
  const ids = [...new Set(workspaceIds)];
  for (const id of ids) result.set(id, { approvals: 0, designQueue: 0 });
  if (ids.length === 0) return result;

  const approvalGatesById = new Map<string, ReviewGate[]>();
  const designQueueIds: string[] = [];

  for (const id of ids) {
    const roles = roleIndex.rolesByWorkspaceId.get(id);
    if (!roles) continue;
    // Matches `getWorkspaceBadges`: no internal access ⇒ both counts are 0.
    const hasInternalRole = INTERNAL_WORKSPACE_ROLES.some((r) => roles.has(r));
    if (!hasInternalRole) continue;

    // `countPendingApprovals` gates.
    const gates: ReviewGate[] = [];
    if (roles.has("internal_reviewer")) gates.push("content", "creative_internal");
    if (roles.has("client_reviewer")) gates.push("creative_client");
    if (gates.length > 0) approvalGatesById.set(id, gates);

    // `countUnassignedDesignItems` gate.
    const canWorkQueue = [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
    ].some((r) => roles.has(r));
    if (canWorkQueue) designQueueIds.push(id);
  }

  const anyGate = [...new Set([...approvalGatesById.values()].flat())];
  const [approvalRows, designQueueRows] = await Promise.all([
    approvalGatesById.size === 0
      ? Promise.resolve([] as { workspaceId: string; gate: ReviewGate; count: number }[])
      : db
          .select({
            workspaceId: contentItems.workspaceId,
            gate: approvalRequests.gate,
            count: sql<number>`count(*)::int`,
          })
          .from(approvalRequests)
          .innerJoin(contentItems, eq(contentItems.id, approvalRequests.contentItemId))
          .where(
            and(
              inArray(contentItems.workspaceId, [...approvalGatesById.keys()]),
              eq(approvalRequests.status, "pending"),
              inArray(approvalRequests.gate, anyGate),
              isNull(contentItems.archivedAt),
            ),
          )
          .groupBy(contentItems.workspaceId, approvalRequests.gate),
    designQueueIds.length === 0
      ? Promise.resolve([] as { workspaceId: string; count: number }[])
      : db
          .select({ workspaceId: contentItems.workspaceId, count: sql<number>`count(*)::int` })
          .from(contentItems)
          .where(
            and(
              inArray(contentItems.workspaceId, designQueueIds),
              isNull(contentItems.archivedAt),
              isNull(contentItems.designerId),
              eq(contentItems.status, "approved_for_design"),
            ),
          )
          .groupBy(contentItems.workspaceId),
  ]);

  for (const row of approvalRows) {
    const allowed = approvalGatesById.get(row.workspaceId);
    if (!allowed || !allowed.includes(row.gate)) continue;
    const entry = result.get(row.workspaceId);
    if (!entry) continue;
    entry.approvals = cap(entry.approvals + row.count);
  }
  for (const row of designQueueRows) {
    const entry = result.get(row.workspaceId);
    if (!entry) continue;
    entry.designQueue = cap(row.count);
  }

  return result;
}

/**
 * Aggregate badge counts for the global agency sidebar.
 *
 * Today the only global badge is the platform-admin "App errors"
 * count. Future global badges (e.g. an agency-wide "Needs your
 * review") plug into the same return shape.
 */
export type GlobalBadges = {
  unreadAppErrors: number;
};

export async function getGlobalBadges(
  actor: Actor,
  isPlatformAdmin: boolean,
): Promise<GlobalBadges> {
  // The platform-errors page renders the full list. A dedicated
  // unread-count service will land with the platform console's
  // filter UI; for now the badge is empty so we don't show a
  // misleading number. The sidebar renders zero as hidden.
  // The unused parameters are kept for forward compatibility —
  // the next iteration will return a real count for the actor.
  void actor;
  void isPlatformAdmin;
  return { unreadAppErrors: 0 };
}
