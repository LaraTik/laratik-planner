"use server";

import { redirect } from "next/navigation";

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
import { setActiveAgencyCookie } from "@/lib/auth/agency-context";
import { switchAgencyContext } from "@/lib/auth/agency-switch";
import type { Actor } from "@/lib/auth/policy";

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
 * Result returned only for a refused switch. A successful switch ends
 * with a server-side redirect after the signed cookie is written, so
 * the browser cannot race the cookie mutation with a client transition.
 */
export type SwitchActiveAgencyResult =
  | { ok: true; agencyId: string; firstWorkspaceSlug: string | null }
  | { ok: false; reason: "unauthenticated" | "not-a-member" | "no-secret" };

/**
 * Switch the active agency and redirect to the first accessible
 * workspace in the new agency. The redirect is issued by the server
 * action after the cookie is written, which makes the agency cookie and
 * destination request one browser navigation.
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
 * If the agency has no active workspace, the destination is `/app`.
 */
export async function switchActiveAgencyAndRedirect(
  agencyId: string,
): Promise<SwitchActiveAgencyResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, reason: "unauthenticated" };
  const actor: Actor = { id: session.user.id };

  const result = await switchAgencyContext(actor, agencyId);
  if (!result.ok) return result;
  redirect(result.destination);
}
