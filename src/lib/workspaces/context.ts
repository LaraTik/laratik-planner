import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { workspaceMemberships, workspaces } from "@/lib/db/schema";
import {
  activeAgencyId,
  canAccessClientWorkspace,
  canAccessInternalWorkspace,
  isAgencyAdmin,
  isAgencyMember,
  type Actor,
} from "@/lib/auth/policy";

/**
 * Milestone 1.4 — workspace-by-slug resolution is agency-scoped.
 *
 * A workspace's identity is the tuple `(agencyId, slug)`. Before
 * M1.4, `findWorkspaceBySlug(slug)` looked the slug up by the
 * active-agency singleton; the singleton was the only agency, so
 * the singleton+slug pair was effectively `(agencyId, slug)`.
 * With multiple agencies on the same deployment, the singleton is
 * replaced by a per-request resolution (`resolveActiveAgencyContext`
 * in `@/lib/auth/agency-context`), and the slug must be looked up
 * inside the agency the actor actually wants — never across.
 *
 * Anti-IDOR contract: the helper never returns a workspace the
 * actor cannot access. For an explicit `requestedAgencyId`, the
 * membership check is the gate; a non-member is denied BEFORE the
 * workspace row is even read, so a guessed slug in another agency
 * cannot leak the existence (or content) of the other agency's
 * workspace. The route layer turns the `null` into a 404, not a
 * 403 — a 403 would let an attacker enumerate slugs by toggling
 * the response code; a 404 hides the existence.
 *
 * The helper is the lowest layer: it does NOT call the resolver.
 * Callers (route handlers, server actions) pass the resolved
 * `agencyId` in. The resolver is a route concern (it reads cookies
 * + handles the explicit override + the fallback); the helper is
 * a pure-DB concern.
 */

/**
 * Look up an active workspace by `(agencyId, slug)`.
 *
 * Resolution order:
 *   - If `requestedAgencyId` is provided, the actor MUST be an
 *     active member of that agency; otherwise this returns `null`
 *     (the caller renders a 404). The membership check is
 *     short-circuit: a denied actor does not consume a workspace
 *     row read.
 *   - Otherwise, the singleton `activeAgencyId()` is used. This is
 *     the M1.4 deprecation path — call sites that have a session
 *     should switch to the explicit `requestedAgencyId` from
 *     `resolveActiveAgencyContext`. Kept here so the existing
 *     single-agency code path continues to work.
 *
 * @returns the workspace row, or `null` when the (agency, slug)
 *   pair is not found OR the actor is not a member of the
 *   requested agency.
 */
export async function findWorkspaceBySlug(actor: Actor, slug: string, requestedAgencyId?: string) {
  if (requestedAgencyId) {
    // Anti-IDOR gate: explicit agency context requires the actor
    // to be a member. A non-member sees null (the route renders
    // 404, not 403) so cross-tenant slug guessing returns the
    // same response as a non-existent slug.
    const isMember = await isAgencyMember(actor, requestedAgencyId);
    if (!isMember) return null;
    return lookupWorkspace(requestedAgencyId, slug);
  }
  // Backward-compat path: singleton lookup. To be replaced by
  // explicit requestedAgencyId in M1.6 (replace activeAgencyId
  // callsites) and removed in M1.7 (drop singleton constraint).
  const agencyId = await activeAgencyId();
  if (!agencyId) return null;
  return lookupWorkspace(agencyId, slug);
}

/**
 * Look up an active workspace by `(agencyId, slug)` and gate on
 * an internal-workspace role. The role check is the
 * `canAccessInternalWorkspace` policy helper; agency admins pass
 * (see `hasWorkspaceRole` in `@/lib/auth/policy`).
 *
 * Returns `null` for: no workspace at `(agencyId, slug)`, or the
 * actor is not a member of `requestedAgencyId` when one is given,
 * or the actor does not hold an internal role.
 */
export async function getAccessibleWorkspace(
  actor: Actor,
  slug: string,
  requestedAgencyId?: string,
) {
  const workspace = await findWorkspaceBySlug(actor, slug, requestedAgencyId);
  if (!workspace) return null;
  if (!(await canAccessInternalWorkspace(actor, workspace.id))) return null;
  return workspace;
}

/**
 * Look up an active workspace by `(agencyId, slug)` and gate on
 * the client-reviewer role only. Same shape as
 * `getAccessibleWorkspace`; the gate is `canAccessClientWorkspace`.
 */
export async function getClientWorkspace(actor: Actor, slug: string, requestedAgencyId?: string) {
  const workspace = await findWorkspaceBySlug(actor, slug, requestedAgencyId);
  if (!workspace) return null;
  if (!(await canAccessClientWorkspace(actor, workspace.id))) return null;
  return workspace;
}

/**
 * The raw DB read. `findWorkspaceBySlug` is the policy-wrapped
 * version; this is the pure-DB inner so the policy path is easy
 * to reason about (and to mock in unit tests).
 */
async function lookupWorkspace(agencyId: string, slug: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.slug, slug)))
    .limit(1);
  return workspace ?? null;
}

/**
 * Every workspace in the current agency the actor can switch to.
 *
 * Members see their own active memberships. Agency admins additionally
 * see every other active workspace in the agency, with member rows
 * first so the order matches what the user expects. Used by the
 * workspace switcher in the sidebar.
 *
 * Note: this helper still uses `activeAgencyId()` (the singleton)
 * for now. M1.6 will thread `resolveActiveAgencyContext` through
 * here; the singleton path is preserved for the bootstrap / setup
 * routes that legitimately have no resolved agency context yet.
 */
export type SwitcherWorkspace = { id: string; name: string; slug: string };

export async function listSwitcherWorkspaces(
  actor: Actor,
): Promise<{ options: SwitcherWorkspace[]; isAdmin: boolean }> {
  const agencyId = await activeAgencyId();
  if (!agencyId) return { options: [], isAdmin: false };
  const isAdmin = await isAgencyAdmin(actor, agencyId);

  const memberRows = await db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaces.status, "active"),
      ),
    )
    .orderBy(asc(workspaces.name))
    .limit(50);

  if (!isAdmin) {
    return { options: memberRows, isAdmin: false };
  }

  const all = await db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.status, "active")))
    .orderBy(asc(workspaces.name))
    .limit(50);

  const seen = new Set(memberRows.map((w) => w.id));
  return {
    options: [...memberRows, ...all.filter((w) => !seen.has(w.id))],
    isAdmin: true,
  };
}
