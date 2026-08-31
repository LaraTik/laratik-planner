import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { agencies, agencyMemberships } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import type { Actor } from "@/lib/auth/policy";
import { captureError } from "@/lib/observability/sentry";

/**
 * Agency context cookie (Milestone 1.2).
 *
 * The active agency is a **server-validated** value, not a client
 * assertion. The only client-side artifact that names an agency is this
 * cookie, and the cookie's payload is HMAC-signed so the server can
 * reject tampering. A valid signature is necessary but not sufficient:
 * `decodeAgencyContext` also re-checks `agency_membership` for the
 * current user. A user whose membership has been revoked or suspended
 * loses the cookie's authority the moment the revocation lands in the
 * DB, on the next decode (no waiting for the cookie to expire).
 *
 * Why a signed cookie (and not a session id into a server-side store):
 *  - Stateless: no DB write on every page load; the membership check
 *    already hits the DB via `agency_memberships`, so adding a cookie
 *    store would be a second query with no added guarantee.
 *  - Portable across restarts / replicas: the secret is the only
 *    server-side state.
 *  - Tenant isolation: a user who is a member of agency A and agency B
 *    can switch by re-issuing the cookie (via setActiveAgencyCookie)
 *    with a server-validated membership check; the user cannot forge a
 *    cookie for an agency they are not a member of (signature requires
 *    the server secret + the membership check would deny).
 *
 * Cookie format (string):
 *   <agency_id>.<expires_at_unix>.<base64url-HMAC-SHA256>
 *   ^ uuid     ^ seconds since epoch, integer  ^ HMAC of the first two
 *                                               parts, key = AGENCY_COOKIE_SECRET
 *
 * The HMAC payload is `<agency_id>.<expires_at_unix>` — the agency id
 * is the *subject* the membership check is keyed on, and the expiry is
 * mixed in so an attacker who somehow gets a valid (agency, expiry)
 * pair for a different agency still cannot re-use the signature.
 *
 * Cookie attributes:
 *   HttpOnly        — never accessible to client JS (XSS cannot read it)
 *   Secure          — when NODE_ENV === "production"
 *   SameSite=Lax    — CSRF protection; "Lax" because the agency switcher
 *                     may navigate cross-origin (OAuth callback → app)
 *   Path=/          — applies to every route in the app
 *   Max-Age=8h      — a working session; revoked memberships are caught
 *                     sooner by the membership re-check, not by expiry
 *
 * Fail-closed:
 *   - No AGENCY_COOKIE_SECRET in production → encodeAgencyContext logs
 *     once and returns the empty string; callers (server actions) must
 *     treat empty as "refused". A missing secret in dev/test is allowed
 *     so unit tests can run with a fixed env, but in production the
 *     encode helper still throws on first call to make the
 *     misconfiguration loud.
 *   - decodeAgencyContext NEVER throws. It returns null on any failure
 *     (malformed, tampered, expired, no membership, DB error). The
 *     route layer decides what to do (404, redirect, re-prompt).
 *
 * Wiring (M1.4 — out of scope for M1.2):
 *   The cookie is set/cleared by server actions / route handlers
 *   produced in M1.4 (e.g. the agency switcher action). M1.2 ships
 *   only the helper + tests; the consumer-side wiring lives in M1.4.
 */

/** Cookie name. Public so tests and the agency switcher can reference it. */
export const AGENCY_CONTEXT_COOKIE_NAME = "laratik_active_agency";

/** Default cookie lifetime: 8h (a working session). */
export const AGENCY_CONTEXT_DEFAULT_MAX_AGE_SECONDS = 8 * 60 * 60;

const SIGNATURE_ALGORITHM = "sha256";

// ─── Secret management ──────────────────────────────────────────────────

/**
 * Tracks whether we've already logged the "missing secret" error so
 * production startup doesn't spam the log once per request. The guard
 * is per-process (module-level).
 */
let missingSecretLogged = false;

function getSecret(): string | null {
  const secret = serverEnv.AGENCY_COOKIE_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (serverEnv.NODE_ENV === "production") {
    if (!missingSecretLogged) {
      // Production misconfiguration: cookie issuance is refused
      // (we already return null below), but the operator still
      // needs a loud signal in Sentry. Fire once per process to
      // avoid log spam.
      captureError(
        "auth.agency_context.missing_secret_prod",
        new Error("AGENCY_COOKIE_SECRET missing or too short"),
        { minBytes: 32 },
      );
      missingSecretLogged = true;
    }
    return null;
  }

  // Dev / test: a missing secret is allowed for the unit suite (where
  // the env is fixed) but still surfaces a clear log line so the
  // developer notices. Fall back to a derived dev key so encode still
  // produces parseable output. This branch is never taken in
  // production (returned null above).
  if (!missingSecretLogged) {
    captureError(
      "auth.agency_context.missing_secret_dev",
      new Error("AGENCY_COOKIE_SECRET missing (dev fallback)"),
      {},
    );
    missingSecretLogged = true;
  }
  return `dev-only-key-${"x".repeat(32)}`;
}

// ─── Pure encode (no DB / cookies()) ─────────────────────────────────────

export type EncodeAgencyContextInput = {
  agencyId: string;
  userId: string;
  maxAgeSeconds?: number;
};

/**
 * Sign an agency id into the cookie payload string.
 *
 * Returns the empty string when the secret is not configured AND
 * NODE_ENV is "production" (fail-closed). Returns a valid signed
 * payload in dev/test (using a derived dev key) so unit tests that
 * don't care about the secret still exercise the encoder.
 */
export function encodeAgencyContext(input: EncodeAgencyContextInput): string {
  const secret = getSecret();
  if (!secret) {
    // Production with no secret (or secret too short) — refuse to
    // issue a cookie. Returning the empty string is the documented
    // fail-closed contract; callers (server actions) must treat
    // empty as "refused" and surface a 500 / re-prompt.
    return "";
  }
  const maxAge = input.maxAgeSeconds ?? AGENCY_CONTEXT_DEFAULT_MAX_AGE_SECONDS;
  const expiresAtUnix = Math.floor(Date.now() / 1000) + Math.max(0, maxAge);
  // userId is mixed into the HMAC payload so a signed cookie for one
  // user cannot be replayed by another user against a different
  // session. The membership re-check at decode time is the actual
  // authorization gate; this is a defense-in-depth binding.
  const payload = `${input.agencyId}.${expiresAtUnix}.${input.userId}`;
  const signature = createHmac(SIGNATURE_ALGORITHM, secret).update(payload).digest("base64url");
  return `${input.agencyId}.${expiresAtUnix}.${signature}`;
}

// ─── decode (with DB membership re-check) ────────────────────────────────

export type DecodedAgencyContext = { agencyId: string };

/**
 * Verify a cookie value and return the agency id it claims — or
 * `null` if anything is wrong. NEVER throws.
 *
 * The check order is deliberate:
 *   1. Parse format (cheap, in-memory)
 *   2. Verify HMAC (constant-time)
 *   3. Verify not expired
 *   4. Verify the user is still an active member of the agency
 *
 * Steps 1–3 are pure (no DB). Step 4 hits the DB. An attacker who
 * tampers with the signature is rejected before we burn a query; a
 * revoked membership is rejected at step 4 so the cookie is effectively
 * live for at most as long as it takes the revocation to land.
 */
export async function decodeAgencyContext(
  value: string,
  actor: Actor,
): Promise<DecodedAgencyContext | null> {
  if (!value || typeof value !== "string") return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;

  const [agencyId, expiresAtRaw, suppliedSignature] = parts;
  if (!agencyId || !expiresAtRaw || !suppliedSignature) return null;

  // The agencyId portion is bound into the HMAC payload below; we also
  // require the membership row to use it as the lookup key. The shape
  // check here is a quick reject for obviously-bad values.
  if (!/^[0-9a-f-]{36}$/i.test(agencyId)) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isInteger(expiresAt)) return null;

  // Constant-time HMAC verification. We bind userId into the payload
  // so the signature is per-(agency, expiry, user); the membership
  // check below is the authorization gate.
  const secret = getSecret();
  if (!secret) {
    // Same fail-closed contract as encodeAgencyContext: no secret in
    // production means we cannot verify any signature. Refuse.
    return null;
  }
  const expectedPayload = `${agencyId}.${expiresAtRaw}.${actor.id}`;
  const expectedSignature = createHmac(SIGNATURE_ALGORITHM, secret)
    .update(expectedPayload)
    .digest("base64url");

  const ok = safeTimingEqualBase64Url(expectedSignature, suppliedSignature);
  if (!ok) return null;

  // Expiry check happens AFTER the HMAC so a forged cookie with a
  // distant future expiry is still rejected.
  const now = Math.floor(Date.now() / 1000);
  if (expiresAt <= now) return null;

  // DB re-check: the user must STILL be an active member of the
  // claimed agency. A revocation that landed after the cookie was
  // issued is caught here, on the next decode.
  try {
    const [row] = await db
      .select({ x: sql<number>`1` })
      .from(agencyMemberships)
      .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
      .where(
        and(
          eq(agencyMemberships.agencyId, agencyId),
          eq(agencyMemberships.userId, actor.id),
          eq(agencyMemberships.status, "active"),
          isNull(agencies.suspendedAt),
          isNull(agencies.archivedAt),
        ),
      )
      .limit(1);
    if (!row) return null;
  } catch {
    // Defensive: a DB error during decode must NEVER crash the
    // request that triggered it. The route layer will treat null as
    // "no valid agency context" and decide what to do.
    return null;
  }

  return { agencyId };
}

/**
 * Constant-time comparison of two base64url strings. We re-encode
 * through Buffer so the comparison uses timingSafeEqual on raw bytes
 * (which is what timingSafeEqual requires), and we explicitly handle
 * the length-mismatch case by returning false instead of throwing —
 * `timingSafeEqual` throws when the buffer lengths differ, and that
 * throw must not escape the decode path.
 */
function safeTimingEqualBase64Url(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, "base64url");
  const bufB = Buffer.from(b, "base64url");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ─── Set / clear (server action helpers) ─────────────────────────────────

/**
 * Issue a fresh signed agency-context cookie for the given actor +
 * agency. Validates membership first; refuses (returns without
 * writing) when the user is not an active member.
 *
 * Returns true when a cookie was written, false when the call was
 * refused. Throws only on internal misconfiguration (no secret in
 * production) — callers should treat that throw as a 500.
 */
export async function setActiveAgencyCookie(actor: Actor, agencyId: string): Promise<boolean> {
  // Membership check is the authorization gate: the user must be an
  // active member of the agency they want to switch into. Without
  // this check, anyone who knows the agencyId could issue themselves
  // a valid cookie (the signature only proves authenticity, not
  // authorization).
  const isMember = await isActiveMember(actor, agencyId);
  if (!isMember) return false;

  const value = encodeAgencyContext({
    agencyId,
    userId: actor.id,
    maxAgeSeconds: AGENCY_CONTEXT_DEFAULT_MAX_AGE_SECONDS,
  });
  // encodeAgencyContext returns "" when the secret is misconfigured in
  // production. Refuse to issue rather than write a useless cookie.
  if (!value) return false;

  const cookieStore = await cookies();
  cookieStore.set({
    name: AGENCY_CONTEXT_COOKIE_NAME,
    value,
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: AGENCY_CONTEXT_DEFAULT_MAX_AGE_SECONDS,
  });
  return true;
}

/**
 * Delete the agency-context cookie from the response. Idempotent:
 * safe to call when the cookie is not set.
 */
export async function clearActiveAgencyCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AGENCY_CONTEXT_COOKIE_NAME);
}

// ─── Resolver (Milestone 1.3) ────────────────────────────────────────────

export type ResolveActiveAgencyContextInput = {
  actor: Actor;
  /**
   * Explicit override hook. Currently no layout or action
   * populates this from `searchParams` — the resolver reads the
   * signed `laratik_active_agency` cookie as the canonical
   * context, and the agency switcher writes that cookie via
   * `switchActiveAgencyAndRedirect` before navigating. The
   * field is retained as a future-facing escape hatch: a
   * server action or middleware that wants to pass
   * `?agency=<id>` through can do so by passing
   * `requestedAgencyId: id` to the resolver directly.
   *
   * Empty string, `null`, and `undefined` are all treated as
   * "not provided" and the resolver falls through to the cookie
   * / fallback paths. Membership is re-checked against `actor`
   * even on the override path; a non-member `requestedAgencyId`
   * returns `null` and the route layer turns that into 404
   * (anti-IDOR).
   */
  requestedAgencyId?: string | null;
};

export type ResolvedAgencyContext = {
  actor: Actor;
  agencyId: string;
  /**
   * Which priority level produced the resolution. Useful for
   * logging / observability and for callers that want to
   * differentiate "user explicitly asked" from "we picked for them".
   */
  source: "requested" | "cookie" | "fallback-single-agency";
};

/**
 * Resolve the active agency for the current request.
 *
 * Priority chain (highest wins):
 *
 *   1. `requestedAgencyId` — explicit override. On membership
 *      failure the resolver returns `null` and does NOT fall
 *      through. Silently downgrading an explicit request would
 *      hide a permission denial and let a user land on a workspace
 *      they have not been granted access to.
 *   2. The signed `laratik_active_agency` cookie. The decoder
 *      already does the membership re-check, so a decoded value
 *      is already authorized. A decoder `null` (tampered,
 *      expired, missing-membership, no secret) is fail-closed:
 *      the resolver returns `null` and does NOT fall through to
 *      the fallback. A stale cookie must lose authority, not be
 *      replaced with an "even older" default.
 *   3. Fallback — the actor's **only** active agency. If the
 *      actor has 0 or 2+ active agencies, the resolver returns
 *      `null` (the route layer will prompt the user via the
 *      agency switcher).
 *
 * Why a chain (not a single source):
 *   - The explicit override is needed for "switch agency" links
 *     that navigate to a workspace in a different agency than the
 *     cookie names. The cookie must NEVER block an explicit
 *     request.
 *   - The cookie is the stickiness mechanism: once a user lands
 *     in agency B, they stay there until they ask for A.
 *   - The fallback lets a brand-new user with exactly one agency
 *     land on a working page without the agency switcher ever
 *     having to fire. (Pre-existing single-agency users must keep
 *     working without any change to their UX.)
 *
 * Returns `null` when no priority level yields a valid agency.
 * The caller decides how to surface that (404, redirect to
 * agency switcher, re-prompt for sign-in, etc.). This helper
 * never throws on application-level denial — it returns `null`.
 *
 * Async because `cookies()` is async in Next.js 16.
 */
export async function resolveActiveAgencyContext(
  input: ResolveActiveAgencyContextInput,
): Promise<ResolvedAgencyContext | null> {
  const { actor, requestedAgencyId } = input;

  // Step 1 — explicit override. Treat empty string as "not
  // provided" so a stray `?agency=` (no value) does not silently
  // short-circuit the chain.
  if (requestedAgencyId && requestedAgencyId.length > 0) {
    const ok = await isActiveMember(actor, requestedAgencyId);
    if (!ok) {
      // Fail-closed. The caller (route / action) decides what to
      // do: 403, redirect to agency switcher, etc. We deliberately
      // do NOT fall through — silently downgrading the explicit
      // request would let a user accidentally land on data they
      // do not have access to.
      return null;
    }
    return {
      actor,
      agencyId: requestedAgencyId,
      source: "requested",
    };
  }

  // Step 2 — signed cookie. `decodeAgencyContext` performs the
  // membership re-check at step 4 of its check order; a non-null
  // return is therefore already authorized. A null return covers
  // tampered, expired, no-membership, no-secret, and DB-error
  // paths — all fail-closed.
  const cookieStore = await cookies();
  const cookieEntry = cookieStore.get(AGENCY_CONTEXT_COOKIE_NAME);
  if (cookieEntry?.value) {
    const decoded = await decodeAgencyContext(cookieEntry.value, actor);
    if (decoded) {
      return {
        actor,
        agencyId: decoded.agencyId,
        source: "cookie",
      };
    }
    // Fail-closed. Do NOT fall through to the fallback path — a
    // stale cookie must lose authority, not be replaced with the
    // user's "older" default. The caller can `clearActiveAgencyCookie()`
    // and re-prompt the user.
    return null;
  }

  // Step 3 — fallback: the actor's only active agency. The
  // `limit(2)` plus length-check makes a 2+ membership a null
  // return without an extra query; the agency switcher (M1.5)
  // is the user-facing resolution path for the multi-membership
  // case.
  const fallback = await findSingleActiveAgency(actor);
  if (fallback) {
    return {
      actor,
      agencyId: fallback,
      source: "fallback-single-agency",
    };
  }

  return null;
}

// ─── Listing (Milestone 1.5) ──────────────────────────────────────────────

/**
 * One row of the agency switcher list — the agency itself plus the
 * actor's per-membership `is_agency_admin` flag, so the UI can badge
 * admin rows without a second round-trip.
 */
export type ActorAgency = {
  id: string;
  name: string;
  slug: string;
  isAdmin: boolean;
};

/**
 * List every agency the actor is an *active* member of, ordered by
 * membership age (ASC) so the user's first joined agency is at the
 * top of the switcher.
 *
 * Contract:
 *  - Filters at the SQL layer (`status = 'active'`) — deactivated /
 *    suspended memberships never appear in the result.
 *  - Joins `agency_membership` to `agency` to return the agency name
 *    and slug (the sidebar popover rows display both).
 *  - Surfaces the per-membership `is_agency_admin` flag renamed to
 *    `isAdmin` for the UI; this is the only place the sidebar learns
 *    which row to badge as "admin".
 *  - Returns `[]` (never null / undefined) when the actor has zero
 *    active memberships; the sidebar's `active` prop falls back to
 *    the first option or renders the empty state.
 *
 * Ordering choice (`agency_membership.created_at ASC`):
 *  - Matches the tie-breaker `resolveActiveAgencyContext`
 *    (`findSingleActiveAgency`) uses for the single-membership
 *    fallback path, so a user with one agency lands on the same row
 *    they would see at the top of the switcher.
 *  - "First joined first" is the deterministic UX a multi-agency
 *    user expects (the agency they woke up in stays at the top until
 *    they switch).
 *
 * This helper is the data source for the agency switcher UI in the
 * sidebar. It is intentionally narrow (no agency-level settings, no
 * member counts, no workspace list) — the workspace switcher owns
 * the workspace list, and agency-level admin surfaces live on
 * separate routes (M2+).
 */
export async function listActorAgencies(actor: Actor): Promise<ActorAgency[]> {
  const rows = await db
    .select({
      id: agencies.id,
      name: agencies.name,
      slug: agencies.slug,
      isAdmin: agencyMemberships.isAgencyAdmin,
    })
    .from(agencyMemberships)
    .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
    .where(
      and(
        eq(agencyMemberships.userId, actor.id),
        eq(agencyMemberships.status, "active"),
        isNull(agencies.suspendedAt),
        isNull(agencies.archivedAt),
      ),
    )
    .orderBy(asc(agencyMemberships.createdAt))
    .limit(50);
  // Project to the documented shape at the function boundary so
  // callers (and tests) cannot accidentally rely on the raw
  // drizzle row leaking extra columns. The select() projection
  // does the same job server-side, but the explicit map makes the
  // contract enforceable from a unit test and survives future
  // schema additions (e.g. a new `agency_membership.is_billing`
  // column would not appear in the switcher without an explicit
  // add here).
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    isAdmin: r.isAdmin,
  }));
}

// ─── Internal helpers ────────────────────────────────────────────────────

/**
 * Look up the actor's only active agency membership. Returns
 * `null` when the actor has 0 or 2+ active agencies. Ordering by
 * `created_at ASC` is the deterministic tie-breaker for the
 * single-membership case (the test asserts that the fallback is
 * stable across calls).
 *
 * The `limit(2)` is the key trick: a user with 0 memberships
 * returns an empty array, a user with 1 returns a 1-row array,
 * and a user with 2+ returns a 2-row array. We never need to
 * count *all* memberships — a 2+ actor must use the agency
 * switcher, not an auto-pick. This keeps the query O(1) in the
 * returned-row count regardless of how many agencies the actor
 * belongs to.
 */
async function findSingleActiveAgency(actor: Actor): Promise<string | null> {
  try {
    const rows = await db
      .select({ agencyId: agencyMemberships.agencyId })
      .from(agencyMemberships)
      .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
      .where(
        and(
          eq(agencyMemberships.userId, actor.id),
          eq(agencyMemberships.status, "active"),
          isNull(agencies.suspendedAt),
          isNull(agencies.archivedAt),
        ),
      )
      .orderBy(asc(agencyMemberships.createdAt))
      .limit(2);
    if (rows.length !== 1) return null;
    return rows[0]!.agencyId;
  } catch {
    // Defensive: a DB error during fallback must NEVER crash the
    // request that triggered it. The resolver returns null, and
    // the route layer treats null as "no valid agency context".
    return null;
  }
}

export async function isActiveMember(actor: Actor, agencyId: string): Promise<boolean> {
  try {
    const [row] = await db
      .select({ x: sql<number>`1` })
      .from(agencyMemberships)
      .innerJoin(agencies, eq(agencies.id, agencyMemberships.agencyId))
      .where(
        and(
          eq(agencyMemberships.agencyId, agencyId),
          eq(agencyMemberships.userId, actor.id),
          eq(agencyMemberships.status, "active"),
          isNull(agencies.suspendedAt),
          isNull(agencies.archivedAt),
        ),
      )
      .limit(1);
    return !!row;
  } catch {
    return false;
  }
}
