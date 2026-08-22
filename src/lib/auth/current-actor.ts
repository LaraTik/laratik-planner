import "server-only";
import { auth } from "@/lib/auth/config";
import type { Actor } from "@/lib/auth/policy";

/**
 * Read the current NextAuth session and return the policy-shaped `Actor`
 * (`{ id: session.user.id }`).
 *
 * M1.6 — this helper replaces the implicit `{ id: session.user.id }`
 * inline construction that previously accompanied every
 * `activeAgencyId()` callsite. It is the canonical way to bridge the
 * NextAuth `Session` object and the policy helpers.
 *
 * Returns `null` when the user is not signed in. Most callers should
 * redirect (`/signin`) or return a 401 when the actor is `null`; the
 * resolver helpers (`resolveActiveAgencyContext`, etc.) treat
 * `null` as "no actor" and fail-closed. We do NOT throw here because
 * the helper sits on the request hot path — a redirect in the caller
 * is the right place to enforce the sign-in gate, not an exception.
 *
 * Why a dedicated helper (and not `{ id: session.user.id }` inline):
 *  - The inline construction grew organically across 30+ callsites
 *    during M1.0–M1.5. Centralizing it makes it trivial to extend
 *    `Actor` later (e.g. an `ipAddress` or `userAgent` for audit
 *    events) without touching every callsite.
 *  - The cost is one async function call, which Next.js 16 inlines.
 *  - It is the single import that future M1.5+ work will compose
 *    with `resolveActiveAgencyContext` — the two helpers together
 *    replace the old `activeAgencyId()` call shape.
 */
export async function currentActor(): Promise<Actor | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return { id: session.user.id };
}
