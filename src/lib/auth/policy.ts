import "server-only";
import { cache } from "react";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencies,
  agencyMemberships,
  contentItems,
  securityAuditEvents,
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

/**
 * Roles that may mutate workspace state. Mirrors the master prompt
 * §9 read/write matrix: every INTERNAL_WORKSPACE_ROLES role except
 * `viewer`, plus the agency-admin shortcut honoured by
 * `hasWorkspaceRole`. `client_reviewer` is intentionally absent —
 * client reviewers can leave comments (the only mutating capability
 * they are allowed) but cannot transition content, edit briefs,
 * upload assets, or sign AI requests.
 *
 * Used by FEAT-16 (GAP-FULL-REVIEW-2026-08-25) to give write API
 * routes an explicit, documentable read-only gate instead of relying
 * on per-route role enumeration that can drift.
 */
export const WRITE_CAPABLE_ROLES = [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "publisher",
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
 * FEAT-16 (GAP-FULL-REVIEW-2026-08-25) — explicit read-only gate for
 * write API routes. Returns true when the actor holds a role that
 * may mutate workspace state (any of WRITE_CAPABLE_ROLES), false for
 * `viewer` and `client_reviewer`. Agency admins still pass via the
 * admin shortcut in `hasWorkspaceRole`.
 *
 * Use this on the API layer (route.ts files) in addition to the
 * service-layer `hasWorkspaceRole` check so a misconfigured route
 * that forgot to enumerate the full internal role set still rejects
 * read-only users with a clear 403 instead of relying on a UI-only
 * guard. The comments service intentionally does NOT call this —
 * `client_reviewer` must still be able to leave client-visible
 * comments per master prompt §9 / §11.
 */
export async function canWriteToWorkspace(actor: Actor, workspaceId: string): Promise<boolean> {
  return hasWorkspaceRole(actor, workspaceId, [...WRITE_CAPABLE_ROLES]);
}

/**
 * Throw `PermissionDeniedError("write_workspace:<action>")` when the
 * actor is read-only. The route layer should treat that throw as a
 * 403. Pair with `requirePolicy` callers — the helper uses the same
 * throw contract.
 *
 * FEAT-20 (GAP-FULL-REVIEW-2026-08-25) — also writes a
 * `security_audit_event` row with `outcome: "denied"` so a
 * security-relevant authorization denial is observable in the
 * audit trail. The audit insert runs *before* the throw, in its
 * own try/catch — a failure to write the audit row must not
 * suppress the original 403, and a successful audit write must
 * not be undone by the throw. The metadata captures the actor's
 * current workspace roles (if any) so the security reviewer can
 * tell a `viewer` denial apart from a no-membership denial.
 */
export async function requireWriteCapability(
  actor: Actor,
  workspaceId: string,
  action: string,
): Promise<void> {
  const allowed = await canWriteToWorkspace(actor, workspaceId);
  if (allowed) return;

  // Read the actor's role set for the audit metadata. We use the
  // same `getWorkspaceRoles` cache the auth check used; a
  // per-denial round-trip to the DB would be wasteful.
  const roles = await getWorkspaceRoles(actor, workspaceId);
  const rolesList = Array.from(roles).sort();

  try {
    await db.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: `write_workspace:${action}`,
      targetType: "workspace",
      targetId: workspaceId,
      outcome: "denied",
      metadata: {
        reason: "actor_not_write_capable",
        actorRoles: rolesList,
        ...(rolesList.length === 0 ? { reason: "actor_not_a_member" } : {}),
      },
    });
  } catch {
    // Audit failures must never change the deny contract. The
    // security-guard wrapper (when wired) will surface the
    // audit-write failure to the observability stack via
    // captureError; the in-process catch is the belt-and-braces
    // path so a transient DB blip during a 403 path cannot
    // accidentally allow the action through.
  }

  throw new PermissionDeniedError(`write_workspace:${action}`);
}

/**
 * Return the actor's full set of workspace roles for a given workspace,
 * in a single query (joined to `workspace_membership` and filtered to
 * the active membership).
 *
 * Agency admins get the union of all six INTERNAL_WORKSPACE_ROLES
 * returned as a single Set — they always satisfy `hasWorkspaceRole`,
 * and short-circuiting there means we don't have to fan out to
 * `isAgencyAdmin` for every role check on a hot page.
 *
 * This helper is `React.cache`-wrapped so multiple components on the
 * same render share the result. The planning detail page used to call
 * `hasWorkspaceRole` 6× in a row, each running 2-3 queries (workspace
 * lookup + agency-admin check + role check). The replacement path
 * makes 1 query per request per workspace.
 */
export const getWorkspaceRoles = cache(
  async (actor: Actor, workspaceId: string): Promise<Set<string>> => {
    // Resolve agencyId for the admin shortcut.
    const [ws] = await db
      .select({ agencyId: workspaces.agencyId })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .limit(1);
    if (!ws) return new Set();

    if (await isAgencyAdmin(actor, ws.agencyId)) {
      return new Set<string>(INTERNAL_WORKSPACE_ROLES);
    }

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
        ),
      )
      // Defensive upper bound: a user can hold at most a handful of
      // roles in one workspace (the schema enum has 7 values). This
      // keeps the query shape consistent with the rest of policy.ts
      // (every other helper terminates with `.limit(1)`) and gives
      // unit-test mocks a deterministic consumption point.
      .limit(100);
    return new Set(rows.map((r) => r.role));
  },
);

// ─── Batched role resolution (hot path) ───────────────────────────────────

/**
 * The actor's effective role set for MANY workspaces, resolved in a fixed
 * number of queries instead of one query per workspace.
 *
 * WHY THIS EXISTS
 *
 * `getWorkspaceRoles(actor, workspaceId)` is per-workspace by contract, and
 * `React.cache` only collapses calls that share the same workspace id. Any
 * caller that needs roles for *N* workspaces therefore pays ~3 queries each —
 * and because every workspace in one agency resolves the SAME agency id, the
 * `isAgencyAdmin` lookup it issues is byte-identical every time.
 *
 * Measured on the app-shell layout path (the layout that runs on EVERY
 * authenticated navigation, including tenant/workspace switches): a member of
 * an agency with 8 workspaces issued **131 SQL round-trips, of which only 6
 * were unique**. 125 were exact repeats; the single most-repeated statement —
 * `select is_agency_admin from agency_membership where agency_id = $1 …` —
 * ran 41 times with identical parameters.
 *
 * This helper collapses that to 3 queries regardless of N:
 *   1. workspace → agency, for all ids at once
 *   2. agency-admin flags, for all DISTINCT agencies at once (usually 1)
 *   3. membership roles, for all ids at once
 *
 * SEMANTICS ARE UNCHANGED — this is deliberately not a cache and does not
 * widen access. It reproduces `getWorkspaceRoles` exactly:
 *   - an agency admin gets the full `INTERNAL_WORKSPACE_ROLES` set for every
 *     workspace in that agency (the same shortcut `hasWorkspaceRole` applies);
 *   - `client_reviewer` is NOT in `INTERNAL_WORKSPACE_ROLES`, so an admin does
 *     not acquire it — matching the per-workspace path;
 *   - a non-admin gets only their actual active-membership roles;
 *   - an unknown/soft-deleted workspace id yields an empty set, exactly like
 *     the single-workspace helper's `if (!ws) return new Set()`.
 *
 * The per-workspace `getWorkspaceRoles`/`hasWorkspaceRole` helpers stay as
 * they are for single-workspace callers; this is the fan-out replacement.
 */
export type ActorWorkspaceRoleIndex = {
  /** Effective roles per requested workspace id, agency-admin override applied. */
  rolesByWorkspaceId: Map<string, Set<string>>;
  /** True where the actor is an agency admin for that workspace's agency. */
  isAgencyAdminByWorkspaceId: Map<string, boolean>;
};

export async function getActorWorkspaceRoleIndex(
  actor: Actor,
  workspaceIds: readonly string[],
): Promise<ActorWorkspaceRoleIndex> {
  const ids = [...new Set(workspaceIds)];
  const rolesByWorkspaceId = new Map<string, Set<string>>();
  const isAgencyAdminByWorkspaceId = new Map<string, boolean>();
  // Seed every requested id so callers can rely on `.get()` returning a Set
  // even for a workspace that no longer exists or is in another agency.
  for (const id of ids) rolesByWorkspaceId.set(id, new Set());
  if (ids.length === 0) return { rolesByWorkspaceId, isAgencyAdminByWorkspaceId };

  const [workspaceRows, roleRows] = await Promise.all([
    db
      .select({ id: workspaces.id, agencyId: workspaces.agencyId })
      .from(workspaces)
      .where(inArray(workspaces.id, ids)),
    db
      .select({
        workspaceId: workspaceMemberships.workspaceId,
        role: workspaceMembershipRoles.role,
      })
      .from(workspaceMembershipRoles)
      .innerJoin(
        workspaceMemberships,
        eq(workspaceMemberships.id, workspaceMembershipRoles.workspaceMembershipId),
      )
      .where(
        and(
          eq(workspaceMemberships.userId, actor.id),
          eq(workspaceMemberships.status, "active"),
          inArray(workspaceMemberships.workspaceId, ids),
        ),
      ),
  ]);

  const agencyIdByWorkspaceId = new Map(workspaceRows.map((r) => [r.id, r.agencyId]));
  const distinctAgencyIds = [...new Set(workspaceRows.map((r) => r.agencyId))];
  // `workspaceRows` is empty ⇒ every requested id is unknown ⇒ no agency to
  // ask about. Drizzle rejects an empty `inArray`, so skip the query.
  const adminAgencyIds =
    distinctAgencyIds.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db
              .select({ agencyId: agencyMemberships.agencyId })
              .from(agencyMemberships)
              .where(
                and(
                  eq(agencyMemberships.userId, actor.id),
                  eq(agencyMemberships.status, "active"),
                  eq(agencyMemberships.isAgencyAdmin, true),
                  inArray(agencyMemberships.agencyId, distinctAgencyIds),
                ),
              )
          ).map((r) => r.agencyId),
        );

  // Group once rather than scanning every role row per workspace: the naive
  // nested loop is O(ids × roleRows) and re-introduces a quadratic blow-up
  // exactly where this helper exists to remove a linear one.
  const rolesByMembershipWorkspace = new Map<string, string[]>();
  for (const row of roleRows) {
    const list = rolesByMembershipWorkspace.get(row.workspaceId);
    if (list) list.push(row.role);
    else rolesByMembershipWorkspace.set(row.workspaceId, [row.role]);
  }

  for (const [workspaceId, roles] of rolesByWorkspaceId) {
    const agencyId = agencyIdByWorkspaceId.get(workspaceId);
    if (agencyId === undefined) continue; // unknown workspace → empty set
    const isAdmin = adminAgencyIds.has(agencyId);
    isAgencyAdminByWorkspaceId.set(workspaceId, isAdmin);
    // Same shortcut as `getWorkspaceRoles`: an agency admin satisfies every
    // internal role check for every workspace in their agency.
    if (isAdmin) {
      rolesByWorkspaceId.set(workspaceId, new Set<string>(INTERNAL_WORKSPACE_ROLES));
      continue;
    }
    for (const role of rolesByMembershipWorkspace.get(workspaceId) ?? []) roles.add(role);
  }

  return { rolesByWorkspaceId, isAgencyAdminByWorkspaceId };
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
  // Single-query fast path: get the full role set (cached per
  // request) and intersect with the requested roles. Avoids the
  // historical 2-3 queries × N-calls N+1.
  const held = await getWorkspaceRoles(actor, workspaceId);
  for (const r of roles) {
    if (held.has(r)) return true;
  }
  return false;
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
