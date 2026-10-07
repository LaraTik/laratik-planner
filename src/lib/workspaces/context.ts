import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { agencyMemberships, agencies, workspaceMemberships, workspaces } from "@/lib/db/schema";
import {
  canAccessClientWorkspace,
  canAccessInternalWorkspace,
  isAgencyAdmin,
  isAgencyMember,
  type Actor,
} from "@/lib/auth/policy";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";

/**
 * Milestone 1.4 — workspace-by-slug resolution is agency-scoped.
 *
 * A workspace's identity is the tuple `(agencyId, slug)`. Before
 * M1.4, `findWorkspaceBySlug(slug)` looked the slug up by the
 * active-agency singleton; the singleton was the only agency, so
 * the singleton+slug pair was effectively `(agencyId, slug)`.
 * With multiple agencies on the same deployment, the singleton
 * is replaced by a per-request resolution
 * (`resolveActiveAgencyContext` in `@/lib/auth/agency-context`),
 * and the slug must be looked up inside the agency the actor
 * actually wants — never across.
 *
 * Anti-IDOR contract (Milestone 1.4 + 1.6 merged): the helper
 * never returns a workspace the actor cannot access.
 *   - When `requestedAgencyId` is provided, the membership check
 *     is the gate; a non-member is denied BEFORE the workspace
 *     row is read, so a guessed slug in another agency cannot
 *     leak the existence (or content) of the other agency's
 *     workspace.
 *   - When `requestedAgencyId` is NOT provided, the helper
 *     delegates to `resolveActiveAgencyContext` (M1.6), which
 *     performs the same membership gate via the resolver's
 *     priority chain. The net effect is identical: non-members
 *     never reach `lookupWorkspace`.
 * The route layer turns the `null` into a 404, not a 403 — a
 * 403 would let an attacker enumerate slugs by toggling the
 * response code; a 404 hides the existence.
 *
 * The optional `requestedAgencyId` parameter is preserved from
 * M1.4 because the layout and the integration tests assert the
 * explicit-control contract (caller chooses the agency; helper
 * gates on membership). M1.6 callers that want the implicit
 * resolver path simply omit the parameter.
 */
async function lookupWorkspace(agencyId: string, slug: string) {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.slug, slug)))
    .limit(1);
  return workspace ?? null;
}

export async function findWorkspaceBySlug(actor: Actor, slug: string, requestedAgencyId?: string) {
  let agencyId: string | null;
  if (requestedAgencyId) {
    // Anti-IDOR gate: explicit agency context requires the actor
    // to be a member. A non-member sees null (the route renders
    // 404, not 403) so cross-tenant slug guessing returns the
    // same response as a non-existent slug.
    const isMember = await isAgencyMember(actor, requestedAgencyId);
    if (!isMember) return null;
    agencyId = requestedAgencyId;
  } else {
    // Implicit path (M1.6): delegate to the resolver. The
    // resolver performs the membership gate internally, so the
    // anti-IDOR contract holds here too.
    const ctx = await resolveActiveAgencyContext({ actor });
    agencyId = ctx?.agencyId ?? null;
  }
  if (!agencyId) return null;
  return lookupWorkspace(agencyId, slug);
}

/**
 * Look up an active workspace by `(agencyId, slug)` and gate on
 * an internal-workspace role. The role check is the
 * `canAccessInternalWorkspace` policy helper; agency admins pass
 * (see `hasWorkspaceRole` in `@/lib/auth/policy`).
 *
 * Returns `null` for: no workspace at `(agencyId, slug)`, or
 * the actor is not a member of `requestedAgencyId` when one is
 * given, or the actor does not hold an internal role.
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
 * Every workspace in the current agency the actor can switch to.
 *
 * Members see their own active memberships in the active agency.
 * Agency admins additionally see every other active workspace in
 * the agency, with member rows first so the order matches what the
 * user expects. Used by the workspace switcher in the sidebar.
 *
 * The agency filter on `memberRows` is critical: without it, a
 * non-admin who holds memberships in two agencies would see
 * workspaces from BOTH agencies when the switcher is rendered in
 * either one (a clear cross-tenant data leak at the UI surface).
 * The active agency is resolved from the signed `laratik_active_agency`
 * cookie (or the single-active-agency fallback) — see
 * `resolveActiveAgencyContext`.
 */
/**
 * Agency id for a slug, gated on the actor being an ACTIVE member.
 *
 * Fails closed: returns `null` for a non-member rather than the row, so a
 * canonical URL can never widen access. Paired with the workspace lookup that
 * returns `null` too, the two together make a wrong-tenant URL a 404 rather
 * than a redirect into data the actor should not see.
 *
 * This is the same anti-IDOR contract `findWorkspaceBySlug` applies to its
 * `requestedAgencyId`; it lives here so the canonical path resolves the slug
 * to an id without the caller having to remember to gate it.
 */
export async function findAgencyIdBySlug(actor: Actor, agencySlug: string): Promise<string | null> {
  const [row] = await db
    .select({ id: agencies.id })
    .from(agencies)
    .innerJoin(
      agencyMemberships,
      and(eq(agencyMemberships.agencyId, agencies.id), eq(agencyMemberships.userId, actor.id)),
    )
    .where(
      and(
        eq(agencies.slug, agencySlug),
        eq(agencyMemberships.status, "active"),
        sql`${agencies.suspendedAt} IS NULL`,
        sql`${agencies.archivedAt} IS NULL`,
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

/**
 * Canonical-path entry point: resolve `(agencySlug, workspaceSlug)` from the URL.
 *
 * Both segments come from the URL, so the workspace is identified rather than
 * guessed from the visitor's active-agency cookie. The agency slug is gated on
 * membership before it is used, and a miss yields `null` → 404.
 *
 * Every page and action under `/app/a/[agencySlug]/w/[workspaceSlug]/` should
 * call one of these two instead of `getAccessibleWorkspace(actor, slug)`.
 */
export async function getAccessibleWorkspaceAtPath(actor: Actor, agencySlug: string, slug: string) {
  const agencyId = await findAgencyIdBySlug(actor, agencySlug);
  if (!agencyId) return null;
  return getAccessibleWorkspace(actor, slug, agencyId);
}

export async function getClientWorkspaceAtPath(actor: Actor, agencySlug: string, slug: string) {
  const agencyId = await findAgencyIdBySlug(actor, agencySlug);
  if (!agencyId) return null;
  return getClientWorkspace(actor, slug, agencyId);
}

/**
 * Agency slug for an id, or `null`. Used by the legacy `/app/w/` redirect to
 * build a canonical href when the visitor has no reachable workspace for the
 * slug but does have an active agency.
 *
 * Deliberately not membership-gated: the caller has ALREADY established that
 * the actor is a member of this agency via `resolveActiveAgencyContext`. This
 * only converts the id into a path segment.
 */
export async function findAgencySlugById(agencyId: string): Promise<string | null> {
  const [agency] = await db
    .select({ slug: agencies.slug })
    .from(agencies)
    .where(eq(agencies.id, agencyId))
    .limit(1);
  return agency?.slug ?? null;
}

export type SwitcherWorkspace = { id: string; name: string; slug: string };

/**
 * Every agency in which `actor` can reach a workspace with this slug.
 *
 * This is deliberately NOT built on `listSwitcherWorkspaces` — that helper
 * resolves the ACTIVE agency internally and therefore only ever returns
 * workspaces in the cookie's agency. Using it to answer "which workspace did
 * this shared link mean?" would reproduce the exact bug the canonical URL
 * exists to fix.
 *
 * Returns one row per reachable workspace. More than one row means the slug is
 * genuinely ambiguous for this actor and the caller must not guess — it should
 * send them somewhere that makes the choice explicit. Zero rows is the
 * anti-IDOR case: indistinguishable from a slug that does not exist.
 *
 * Membership-only (not admin-broad): the redirect's job is to resolve a link a
 * human was sent, and the human has to actually be a member of the workspace to
 * use it.
 */
export async function findReachableWorkspacesBySlug(
  actor: Actor,
  slug: string,
): Promise<{ workspaceId: string; agencyId: string; agencySlug: string }[]> {
  return db
    .select({
      workspaceId: workspaces.id,
      agencyId: workspaces.agencyId,
      agencySlug: agencies.slug,
    })
    .from(workspaces)
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .innerJoin(workspaceMemberships, eq(workspaceMemberships.workspaceId, workspaces.id))
    .where(
      and(
        eq(workspaces.slug, slug),
        eq(workspaces.status, "active"),
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(10);
}

export async function listSwitcherWorkspaces(
  actor: Actor,
): Promise<{ options: SwitcherWorkspace[]; isAdmin: boolean }> {
  const ctx = await resolveActiveAgencyContext({ actor });
  const agencyId = ctx?.agencyId ?? null;
  if (!agencyId) return { options: [], isAdmin: false };
  const isAdmin = await isAgencyAdmin(actor, agencyId);

  // Member rows MUST be agency-scoped. Pre-fix, this query joined
  // workspaceMemberships with workspaces but did not constrain
  // workspaces.agencyId, so a multi-agency user saw workspaces
  // from every agency they had a membership in (a cross-tenant
  // UI leak). The agency admin path below was already correct.
  const memberRows = await db
    .select({ id: workspaces.id, name: workspaces.name, slug: workspaces.slug })
    .from(workspaceMemberships)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
    .where(
      and(
        eq(workspaceMemberships.userId, actor.id),
        eq(workspaceMemberships.status, "active"),
        eq(workspaces.status, "active"),
        eq(workspaces.agencyId, agencyId),
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
