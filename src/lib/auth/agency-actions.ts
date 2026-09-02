"use server";

/**
 * Server actions for the agency switcher (M1.5).
 *
 * The agency switcher is a client component (it owns popover state +
 * keyboard navigation). It must still call `setActiveAgencyCookie` to
 * issue a fresh signed cookie for the newly selected agency. We
 * expose that side-effect through this `"use server"` file so the
 * client can call it as an RPC without knowing the server-side
 * details (auth resolution, membership re-check, cookie attributes).
 *
 * Authentication:
 *   Each action resolves the actor from the NextAuth session at call
 *   time, NOT from any client-submitted value. The client cannot
 *   impersonate another user — `setActiveAgencyCookie` is the
 *   authorization gate (it validates the actor is an active member of
 *   the requested agency before issuing the cookie).
 *
 * Why a separate file:
 *   - `"use server"` is file-scoped. Putting the action in its own
 *     module makes the boundary explicit: every export of this file
 *     runs on the server.
 *   - The agency-switcher client component imports only the action's
 *     async function (Next.js turns the import into an RPC stub at
 *     build time). The implementation never ships to the browser.
 */

import { auth } from "@/lib/auth/config";
import { isActiveMember, setActiveAgencyCookie } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import { workspaces, workspaceMemberships } from "@/lib/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { isAgencyAdmin, type Actor } from "@/lib/auth/policy";

/**
 * Set the active agency for the currently signed-in user.
 *
 * Returns:
 *   - `true` when the cookie was written (the user is an active
 *     member of `agencyId`).
 *   - `false` when the user is not signed in, or is not an active
 *     member of `agencyId`. The caller (agency switcher UI) should
 *     treat `false` as "switch refused" and keep the popover open
 *     with an error message; the user must pick a different agency.
 *
 * The cookie is HMAC-signed and HttpOnly; the membership re-check
 * inside `setActiveAgencyCookie` is the authorization gate. A
 * non-member caller cannot forge a cookie for an agency they are
 * not in.
 */
export async function switchActiveAgency(agencyId: string): Promise<boolean> {
  const session = await auth();
  if (!session?.user?.id) return false;
  const actor: Actor = { id: session.user.id };
  return setActiveAgencyCookie(actor, agencyId);
}

/**
 * Result of a switch-and-redirect. The agency switcher uses this to
 * navigate the user to a sensible URL inside the newly-active agency
 * rather than dumping them on the global `/app` landing — which leaves
 * the previous (now invalid) workspace URL in the address bar until
 * the next click. Returning both the new agency and a default
 * workspace slug lets the client pick the right destination in one
 * router transition.
 */
export type SwitchActiveAgencyResult =
  | { ok: true; agencyId: string; firstWorkspaceSlug: string | null }
  | { ok: false; reason: "unauthenticated" | "not-a-member" | "no-secret" };

/**
 * Switch the active agency AND return the slug of the first workspace
 * the user can land on in the new agency. The client navigates to
 * `/app/w/<firstWorkspaceSlug>` (or `/app` if the agency has no
 * accessible workspaces) so the URL atomically reflects the new
 * context.
 *
 * Anti-IDOR: the membership check uses the same signed-cookie +
 * server-side `isActiveMember` re-check the resolver uses, so a
 * non-member cannot switch into an agency they don't belong to. The
 * workspace lookup is membership-scoped: a user with admin access
 * sees every active workspace in the agency; a regular member sees
 * only their active memberships, ordered by name.
 *
 * The `no-secret` reason is reserved for the production
 * misconfiguration case (missing `AGENCY_COOKIE_SECRET`) — the
 * encoder refuses to issue a cookie so the switch is impossible.
 * The caller's `redirect()` fallback is `/app`, which the resolver
 * will then resolve to null (no cookie) and the layout will prompt
 * the user to set up.
 */
export async function switchActiveAgencyAndRedirect(
  agencyId: string,
): Promise<SwitchActiveAgencyResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" };
  const actor: Actor = { id: session.user.id };

  // Membership is the authorization gate. The cookie issuer (below)
  // re-checks membership; we check here too so the "not-a-member"
  // reason is distinguishable from a production misconfiguration.
  const isMember = await isActiveMember(actor, agencyId);
  if (!isMember) return { ok: false, reason: "not-a-member" };

  const cookieWritten = await setActiveAgencyCookie(actor, agencyId);
  if (!cookieWritten) return { ok: false, reason: "no-secret" };

  // First accessible workspace in the new agency, ordered by name.
  // Agency admins are allowed to enter every active workspace even when
  // they do not have an explicit workspace_membership row. Regular
  // members remain restricted to their own active memberships.
  // Workspace status = active only (soft-deleted / archived are excluded
  // at the SQL layer).
  const admin = await isAgencyAdmin(actor, agencyId);
  const memberRows = admin
    ? await db
        .select({ slug: workspaces.slug })
        .from(workspaces)
        .where(and(eq(workspaces.agencyId, agencyId), eq(workspaces.status, "active")))
        .orderBy(asc(workspaces.name))
        .limit(1)
    : await db
        .select({ slug: workspaces.slug })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(
          and(
            eq(workspaceMemberships.userId, actor.id),
            eq(workspaceMemberships.status, "active"),
            eq(workspaces.agencyId, agencyId),
            eq(workspaces.status, "active"),
          ),
        )
        .orderBy(asc(workspaces.name))
        .limit(1);
  if (memberRows.length > 0) {
    return { ok: true, agencyId, firstWorkspaceSlug: memberRows[0]!.slug };
  }

  // A member can legitimately belong to an agency without having an
  // active workspace assignment. Keep the context switch successful,
  // but let the global app surface explain that no workspace is available.
  return { ok: true, agencyId, firstWorkspaceSlug: null };
}
