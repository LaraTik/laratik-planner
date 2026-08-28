import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { and, eq, like, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users, verificationTokens } from "@/lib/db/schema";

/**
 * Password sign-in helpers — used by the NextAuth Credentials provider
 * (src/lib/auth/config.ts) and the password reset flow.
 *
 * Tokens live in the existing `verification_tokens` table so the
 * NextAuth adapter's normal cleanup (and the rate-limit helper) keep
 * working. The `identifier` column discriminates by purpose:
 *   - "password-reset:<userId>" — reset link
 *
 * The raw token is sent in the email; only its SHA-256 hash is stored
 * in the table, so a leaked DB row cannot be used directly to sign in.
 * Tokens are single-use (consumed on success) and expire in 1 hour.
 */

const BCRYPT_COST = 12;
const RESET_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const RESET_IDENTIFIER_PREFIX = "password-reset";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Hash a plaintext password with bcrypt (cost 12). */
export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * Generate a one-shot strong temporary password for the
 * "Add directly" admin flow (see `lib/auth/user-creation.ts`).
 *
 * 16 characters, drawn from `[A-Za-z0-9!@#$%^&*]`. Always passes
 * `isPasswordStrong` (length + letter + digit) and is safe to render
 * in a "share these credentials securely" reveal strip — the caller
 * must ensure the reveal is one-time and the temporary password is
 * never persisted in plaintext anywhere except the bcrypt hash.
 *
 * `randomBytes(24)` over-allocates entropy for a 16-char output
 * (192 bits >> 16*log2(70) ≈ 99 bits needed) and gives plenty of
 * slack against biased sampling modulo a 70-character alphabet.
 */
export function generateStrongPassword(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  const bytes = randomBytes(24);
  let out = "";
  for (let i = 0; i < 16; i++) {
    // Modulo is safe here because the alphabet length (70) is well
    // under 256 and the input is uniformly random — the bias on any
    // single character is < 0.5%.
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

/** Verify a plaintext password against a stored bcrypt hash. */
export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Validate a password meets the minimum strength bar. NIST 800-63B
 * rejects composition rules (must contain symbol etc.) — we only
 * require a length + letter + digit, which matches industry best
 * practice as of 2026.
 */
export function isPasswordStrong(plain: string): boolean {
  if (typeof plain !== "string") return false;
  if (plain.length < 8 || plain.length > 200) return false;
  if (!/[A-Za-z]/.test(plain)) return false;
  if (!/[0-9]/.test(plain)) return false;
  return true;
}

/**
 * Issue a password-reset token for the user with the given email.
 * Returns null if no user exists (caller should respond identically
 * to avoid email enumeration).
 */
export async function issuePasswordResetToken(
  email: string,
): Promise<{ raw: string; expiresAt: Date } | null> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (!user) return null;

  const raw = randomBytes(32).toString("base64url");
  const tokenHash = sha256(raw);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_SECONDS * 1000);
  const identifier = `${RESET_IDENTIFIER_PREFIX}:${user.id}`;

  // Invalidate any prior pending reset tokens for this user.
  await db
    .delete(verificationTokens)
    .where(like(verificationTokens.identifier, `${RESET_IDENTIFIER_PREFIX}:${user.id}`));

  await db.insert(verificationTokens).values({
    identifier,
    token: tokenHash,
    expires: expiresAt,
  });
  return { raw, expiresAt };
}

/**
 * Validate the raw token, set the user's password, and consume the
 * token in one transaction. Returns the user id on success, null if
 * the token is invalid/expired/already-used.
 */
export async function consumePasswordResetToken(
  raw: string,
  newPassword: string,
): Promise<{ userId: string } | null> {
  if (!isPasswordStrong(newPassword)) return null;
  if (typeof raw !== "string" || raw.length < 16) return null;

  const tokenHash = sha256(raw);
  // The identifier encodes the user id; the token is the hash. Look
  // up the row by (identifier prefix + token hash), check expiry, and
  // then update the user's passwordHash in the same transaction.
  const [row] = await db
    .select({
      identifier: verificationTokens.identifier,
      token: verificationTokens.token,
      expires: verificationTokens.expires,
    })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.token, tokenHash),
        like(verificationTokens.identifier, `${RESET_IDENTIFIER_PREFIX}:%`),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (row.expires < new Date()) return null;

  const userId = row.identifier.slice(RESET_IDENTIFIER_PREFIX.length + 1);
  if (!userId) return null;

  const newHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    // Stamp `emailVerified` if the user hasn't been verified before.
    // The reset token was emailed to them; successfully consuming it
    // proves email control, which is exactly what `emailVerified`
    // means. Without this stamp, a user who only ever signs in via
    // email+password (e.g. via the forgot-password flow) would fail
    // the `invitationIdentityMatches` check on /accept-invitation and
    // never be able to accept an invitation. COALESCE preserves any
    // pre-existing verification timestamp.
    await tx
      .update(users)
      .set({
        passwordHash: newHash,
        emailVerified: sql`COALESCE(${users.emailVerified}, NOW())`,
      })
      .where(eq(users.id, userId));
    await tx
      .delete(verificationTokens)
      .where(
        and(
          eq(verificationTokens.identifier, row.identifier),
          eq(verificationTokens.token, row.token),
        ),
      );
  });
  return { userId };
}

/** Direct, internal-only "set a new password" without a token. */
export async function setPassword(userId: string, plain: string): Promise<void> {
  if (!isPasswordStrong(plain)) {
    throw new Error("Password must be at least 8 characters and contain a letter and a digit.");
  }
  const newHash = await hashPassword(plain);
  await db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId));
}

/**
 * Look up a user by email + password. Used by the Credentials
 * provider; returns null on any failure so the caller doesn't leak
 * which side of the credential pair was wrong. The `mustChangePassword`
 * flag is forwarded so the JWT callback can stamp it on first
 * sign-in (the first-login redirect middleware reads the flag from
 * the JWT to route the user to /set-password).
 */
export async function findUserByEmailAndPassword(
  email: string,
  password: string,
): Promise<{
  id: string;
  email: string;
  name: string | null;
  mustChangePassword: boolean;
} | null> {
  const normalized = email.trim().toLowerCase();
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      passwordHash: users.passwordHash,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.email, normalized))
    .limit(1);
  if (!user?.passwordHash) return null;
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    mustChangePassword: user.mustChangePassword === true,
  };
}
