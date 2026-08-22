import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
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

export const INTERNAL_WORKSPACE_ROLES = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "publisher",
  "viewer",
] as const;

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

/** Effective workspace access, including the agency-admin override. */
export async function canAccessWorkspace(actor: Actor, workspaceId: string): Promise<boolean> {
  const [ws] = await db
    .select({ agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!ws) return false;
  return (await isAgencyAdmin(actor, ws.agencyId)) || isWorkspaceMember(actor, workspaceId);
}

/** Access to agency-internal workspace data and screens. */
export async function canAccessInternalWorkspace(
  actor: Actor,
  workspaceId: string,
): Promise<boolean> {
  return hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]);
}

/** Access to the deliberately restricted client review surface. */
export async function canAccessClientWorkspace(
  actor: Actor,
  workspaceId: string,
): Promise<boolean> {
  return hasWorkspaceRole(actor, workspaceId, ["client_reviewer"]);
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

/**
 * Return the id of the agency that the **bootstrap / setup path**
 * should use when no actor is available to drive a per-request
 * resolution.
 *
 * The single-agency era had a DB-enforced singleton (the unique
 * index on `singleton_key` + the `singleton_key = true` check + a
 * NOT NULL default). All three are gone after migration 0008
 * (M1.7), so "the one active agency" is no longer a query that
 * returns a single row by invariant — it is a query that returns
 * the most-recently-created row.
 *
 * This helper is **only** for the bootstrap / dev-seed / setup
 * flows that run before the request layer can call
 * `resolveActiveAgencyContext(actor)` (M1.3). For every other code
 * path, the agency for the current request comes from
 * `resolveActiveAgencyContext` — that helper does the right thing
 * for multi-agency actors (cookie + explicit override +
 * single-membership fallback), whereas this one just picks a row
 * out of the agency table.
 *
 * Ordering by `created_at DESC` is the deterministic "newest wins"
 * rule. In a single-agency deployment this is equivalent to the
 * legacy `WHERE singleton_key = true` lookup. In a multi-agency
 * deployment the bootstrap path is the only consumer and there
 * is no "active agency" in the legacy sense; "newest" is the
 * closest analog to "the one that was just provisioned".
 *
 * @returns the most-recently-created agency id, or `null` when the
 *   agency table is empty.
 */
export async function firstAgencyForBootstrap(): Promise<string | null> {
  const [a] = await db
    .select({ id: agencies.id })
    .from(agencies)
    .orderBy(desc(agencies.createdAt))
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

/**
 * Can the actor edit a target user's agency-level fields (isAgencyAdmin flag
 * and per-workspace role assignments)?
 *
 * Agency admins can manage any other active member of the same agency, but
 * not themselves for the agency-admin toggle (lockout protection is
 * enforced separately by `assertCanDemoteAgencyAdmin` in
 * `src/lib/auth/member-safety.ts`).
 *
 * The target's existing agency-membership row must exist and be active
 * (deactivated members cannot be re-edited by this helper — the UI hides
 * the Edit affordance for them).
 */
export async function canManageAgencyMember(
  actor: Actor,
  targetUserId: string,
  agencyId: string,
): Promise<boolean> {
  if (actor.id === targetUserId) return false;
  if (!(await isAgencyAdmin(actor, agencyId))) return false;
  const [row] = await db
    .select({ x: sql<number>`1` })
    .from(agencyMemberships)
    .where(
      and(
        eq(agencyMemberships.agencyId, agencyId),
        eq(agencyMemberships.userId, targetUserId),
        eq(agencyMemberships.status, "active"),
      ),
    )
    .limit(1);
  return !!row;
}
