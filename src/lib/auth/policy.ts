import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencies,
  agencyMemberships,
  contentItems,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";

/**
 * Authorization policy helpers — TypeScript equivalents of the master
 * prompt §9 SQL helper functions. Every service-layer command calls one
 * of these to verify the actor is permitted to perform the action.
 *
 * Conventions:
 *  - All helpers take the actor's userId explicitly; never trust a
 *    session.user.id from a route param.
 *  - All helpers return booleans (not throws). The service layer
 *    translates false → 403 / "permission denied".
 *  - Agency admins (per agency_memberships.is_agency_admin = true)
 *    always have full access. They don't need duplicate workspace role
 *    rows.
 */

export type Actor = { id: string };

// ─── Agency-level ──────────────────────────────────────────────────────────
/** Is the user an active admin of the given agency? */
export async function isAgencyAdmin(actor: Actor, agencyId: string): Promise<boolean> {
  const [m] = await db
    .select({ isAdmin: agencyMemberships.isAgencyAdmin })
    .from(agencyMemberships)
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        eq(agencyMemberships.userId, actor.id),
        eq(agencyMemberships.status, "active"),
      ),
    )
    .limit(1);
  return !!m?.isAdmin;
}

/** Is the user any kind of active member of the agency? */
export async function isAgencyMember(actor: Actor, agencyId: string): Promise<boolean> {
  const [m] = await db
    .select({ x: sql<number>`1` })
    .from(agencyMemberships)
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        eq(agencyMemberships.userId, actor.id),
        eq(agencyMemberships.status, "active"),
      ),
    )
    .limit(1);
  return !!m;
}

// ─── Workspace-level ──────────────────────────────────────────────────────
/** Is the user any kind of active member of the workspace? */
export async function isWorkspaceMember(actor: Actor, workspaceId: string): Promise<boolean> {
  const [m] = await db
    .select({ x: sql<number>`1` })
    .from(workspaceMemberships)
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(1);
  return !!m;
}

/**
 * Does the user hold one of the given workspace roles?
 * Agency admins always return true (master prompt §9 rule).
 */
export async function hasWorkspaceRole(
  actor: Actor,
  workspaceId: string,
  roles: string[],
): Promise<boolean> {
  // Resolve agencyId for the admin shortcut
  const [ws] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!ws) return false;

  if (await isAgencyAdmin(actor, ws.agencyId)) return true;

  const rows = await db
    .select({ role: workspaceMembershipRoles.role })
    .from(workspaceMembershipRoles)
    .innerJoin(
      workspaceMemberships,
      eq(workspaceMemberships.id, workspaceMembershipRoles.workspaceMembershipId),
    )
    .where(
      and(
        eq(workspaceMemberships.workspaceId, workspaceId),
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
        inArray(workspaceMembershipRoles.role, roles as never),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ─── Content-level (master prompt §9) ────────────────────────────────────
/** Can the actor view a given content item? */
export async function canViewContent(actor: Actor, contentItemId: string): Promise<boolean> {
  // Resolve the workspace + agency
  const [row] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      agencyId: workspaces.agencyId,
    })
    .from(contentItems)
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!row) return false;

  if (await isAgencyAdmin(actor, row.agencyId)) return true;
  return isWorkspaceMember(actor, row.workspaceId);
}

/** Can the actor manage (edit / archive) a given content item? */
export async function canManageContent(actor: Actor, contentItemId: string): Promise<boolean> {
  return hasWorkspaceRole(actor, await workspaceIdForContent(contentItemId), [
    "workspace_manager",
    "content_planner",
  ]);
}

/** Can the actor review at a given gate? */
export async function canReview(
  actor: Actor,
  contentItemId: string,
  gate: "content" | "creative_internal" | "creative_client",
): Promise<boolean> {
  const workspaceId = await workspaceIdForContent(contentItemId);
  if (gate === "content") {
    return hasWorkspaceRole(actor, workspaceId, ["internal_reviewer"]);
  }
  if (gate === "creative_internal") {
    return hasWorkspaceRole(actor, workspaceId, ["internal_reviewer"]);
  }
  // creative_client
  return hasWorkspaceRole(actor, workspaceId, ["client_reviewer"]);
}

// ─── Helpers ──────────────────────────────────────────────────────────────
async function workspaceIdForContent(contentItemId: string): Promise<string> {
  const [row] = await db
    .select({ workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!row) throw new Error(`Content item ${contentItemId} not found`);
  return row.workspaceId;
}

/** Active agency singleton (master prompt §8 invariant). */
export async function activeAgencyId(): Promise<string | null> {
  const [a] = await db
    .select({ id: agencies.id })
    .from(agencies)
    .where(eq(agencies.singletonKey, true))
    .limit(1);
  return a?.id ?? null;
}

/** Throw a "permission denied" error. Used by the service layer. */
export class PermissionDeniedError extends Error {
  constructor(public action: string) {
    super(`Permission denied: ${action}`);
    this.name = "PermissionDeniedError";
  }
}

/** Convenience: require the predicate, throw if false. */
export async function requirePolicy(predicate: Promise<boolean>, action: string): Promise<void> {
  if (!(await predicate)) {
    throw new PermissionDeniedError(action);
  }
}
