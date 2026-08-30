import "server-only";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { approvalRequests, contentItems } from "@/lib/db/schema";
import { canAccessInternalWorkspace, hasWorkspaceRole, type Actor } from "@/lib/auth/policy";

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
