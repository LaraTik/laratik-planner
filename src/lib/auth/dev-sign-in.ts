import "server-only";
import { encode } from "next-auth/jwt";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";

/**
 * Dev/test sign-in helper.
 *
 * Upserts a user with the given email, then signs a NextAuth v5 JWT
 * (the same shape `auth()` reads from the session cookie). The token
 * is returned to the caller, which is responsible for setting it as
 * a cookie via either:
 *   - `res.cookies.set(...)` (API route handler)
 *   - `cookies().set(...)`  (server action / RSC)
 *
 * Gated by `NODE_ENV !== "production"` so the helper is a no-op in
 * prod builds. Used by:
 *   - `src/app/api/dev/sign-in/route.ts`     (Playwright bootstrap)
 *   - `src/app/dev/signin/page.tsx`           (one-click human dev sign-in)
 *
 * Production sign-in ALWAYS goes through Google OAuth or Nodemailer
 * magic link — this path is dev/test only.
 */
export type DevSignInInput = {
  email: string;
  name?: string;
  role?: "agency_admin" | "user";
};

export type DevSignInResult =
  | {
      ok: true;
      userId: string;
      email: string;
      name: string;
      role: "agency_admin" | "user";
      token: string;
    }
  | { ok: false; error: "not_available_in_production" }
  | { ok: false; error: "invalid_email" }
  | { ok: false; error: "missing_auth_secret" };

const SESSION_COOKIE_NAME = "authjs.session-token";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const DEV_SESSION_COOKIE_NAME = SESSION_COOKIE_NAME;
export const DEV_SESSION_MAX_AGE_SECONDS = SESSION_MAX_AGE_SECONDS;

export async function signInDevUser(input: DevSignInInput): Promise<DevSignInResult> {
  if (serverEnv.NODE_ENV === "production") {
    return { ok: false, error: "not_available_in_production" };
  }
  if (!serverEnv.AUTH_SECRET) {
    return { ok: false, error: "missing_auth_secret" };
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "invalid_email" };
  }

  const role: "agency_admin" | "user" = input.role === "user" ? "user" : "agency_admin";

  // Find or create the user. Email-verified at sign-in time.
  const existing = await db
    .select({ id: users.id, role: users.role, name: users.name })
    .from(users)
    .where(sql`lower(${users.email}) = ${email}`)
    .limit(1);

  // Name resolution order:
  //   1. Caller-supplied name on this call
  //   2. Stored name on an existing user (preserves the name they signed in with)
  //   3. Email local-part as a last-resort default
  const name = input.name?.trim() || existing[0]?.name || email.split("@")[0]!;

  let userId: string;
  if (existing[0]) {
    userId = existing[0].id;
    // Keep role in sync (idempotent for E2E and dev re-signs)
    if (existing[0].role !== role) {
      await db.update(users).set({ role }).where(eq(users.id, userId));
    }
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email,
        name,
        displayName: name,
        role,
        emailVerified: new Date(),
      })
      .returning({ id: users.id });
    userId = created!.id;
  }

  // Sign the NextAuth JWT cookie (v5 uses @auth/core token shape)
  const token = await encode({
    token: {
      sub: userId,
      id: userId,
      role,
      email,
      name,
    },
    secret: serverEnv.AUTH_SECRET,
    salt: SESSION_COOKIE_NAME,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return { ok: true, userId, email, name, role, token };
}
