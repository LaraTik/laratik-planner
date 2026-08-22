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
import { setActiveAgencyCookie } from "@/lib/auth/agency-context";
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
