import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { platformAdministrators } from "@/lib/db/schema";
import { PermissionDeniedError, type Actor } from "@/lib/auth/policy";

/**
 * Platform-admin authorization helpers (Milestone 1.1).
 *
 * Platform authority is **separate from** agency authority. A user can be
 * a platform admin without being a member of any specific agency, and a
 * user can be an active agency admin without being a platform admin.
 * Platform routes (M2) gate on these helpers; they must NOT acquire
 * tenant content access automatically.
 *
 * Conventions (mirror `src/lib/auth/policy.ts`):
 *  - All helpers take the actor's userId explicitly; never trust a
 *    session.user.id from a route param.
 *  - `isPlatformAdmin` returns a boolean (not throws). The route layer
 *    translates false → 403 / "permission denied".
 *  - `requirePlatformAdmin` throws `PermissionDeniedError` with the
 *    canonical action code `"platform-admin-required"`. Service-layer
 *    callers should catch that specifically; the route layer can let
 *    it bubble to the global 403 handler.
 *  - No caching: the table is small (single-digit rows in the bootstrap
 *    era; more later but still bounded) and the check is cheap.
 *
 * The query filters `revoked_at IS NULL` so revoked platform admins
 * are no longer live admins. The soft-revoked row is kept for the
 * audit trail of "who was ever a platform admin".
 *
 * Any DB error in `isPlatformAdmin` returns `false` (defensive: a
 * platform-admin check must never crash the request that triggered it).
 * Callers that need to *fail loud* should use `requirePlatformAdmin`,
 * which still swallows errors as "not admin" — same defensive
 * behavior. The service layer logs DB errors upstream.
 */
export async function isPlatformAdmin(actor: Actor): Promise<boolean> {
  try {
    const [row] = await db
      .select({ x: sql<number>`1` })
      .from(platformAdministrators)
      .where(
        and(eq(platformAdministrators.userId, actor.id), isNull(platformAdministrators.revokedAt)),
      )
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}

/** Throw `PermissionDeniedError("platform-admin-required")` if the actor is not a platform admin. */
export async function requirePlatformAdmin(actor: Actor): Promise<void> {
  const ok = await isPlatformAdmin(actor);
  if (!ok) {
    throw new PermissionDeniedError("platform-admin-required");
  }
}
