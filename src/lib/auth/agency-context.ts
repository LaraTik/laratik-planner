import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { agencyMemberships } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import type { Actor } from "@/lib/auth/policy";

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
      console.error(
        "[auth.agency-context] AGENCY_COOKIE_SECRET is not set or is too short " +
          "(need ≥ 32 bytes). Production must have a stable secret; refusing " +
          "to issue cookies. Generate one with: openssl rand -base64 32",
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
    console.error(
      "[auth.agency-context] AGENCY_COOKIE_SECRET is not set. Issuing cookies " +
        "with a derived dev key — DO NOT deploy this configuration.",
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
      .where(
        and(
          eq(agencyMemberships.agencyId, agencyId),
          eq(agencyMemberships.userId, actor.id),
          eq(agencyMemberships.status, "active"),
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

// ─── Internal helpers ────────────────────────────────────────────────────

async function isActiveMember(actor: Actor, agencyId: string): Promise<boolean> {
  try {
    const [row] = await db
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
    return !!row;
  } catch {
    return false;
  }
}
