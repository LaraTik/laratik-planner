import "server-only";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { isPasswordStrong, setPassword, verifyPassword } from "@/lib/auth/password";
import { SUPPORTED_LOCALES, type LocaleCode } from "@/lib/i18n/locales";

/**
 * Own-profile helpers — used by the /app/account server actions.
 *
 * Functions in this module are pure of any HTTP context: they take
 * the actor's user id + the validated input and return a discriminated
 * result. The server action layer is responsible for `auth()`,
 * redirecting, and revalidating.
 *
 * Password change intentionally re-uses the existing `setPassword`
 * helper (no current-password check) wrapped in a verify step that
 * runs only when the user already has a password. OAuth-only users
 * (no `passwordHash`) skip the verify step and go straight to
 * `setPassword`, so the same code path covers both "set" and
 * "change" cases from the Account page.
 *
 * NOTE on session lifetime: the project uses JWT sessions (master
 * prompt §4) which are decoded from the cookie on every request. A
 * password change does NOT invalidate the current JWT — a hijacker
 * with a stolen cookie remains signed in until the token's natural
 * expiry (max 30 days). Forcing a re-sign-in would require a
 * `tokenVersion` column on the user row plus a JWT callback check,
 * which is out of scope for the Account page v1. We log the change
 * so a future security audit can correlate.
 */

// ─── Profile update ────────────────────────────────────────────────────────

/**
 * The closed set of profile-locale values. Mirrored from
 * `src/lib/i18n/locales.ts` `SUPPORTED_LOCALES` so the Zod
 * schema, the form, the action, and the resolver all read
 * from a single source of truth. Adding a third locale is
 * a one-line change to `SUPPORTED_LOCALES`; the schema and
 * every consumer pick it up automatically.
 */
const LOCALE_VALUES = SUPPORTED_LOCALES.map((l) => l.code) as unknown as readonly [
  LocaleCode,
  ...LocaleCode[],
];
export type Locale = LocaleCode;

const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  image: z
    .string()
    .trim()
    .url()
    .max(2048)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  locale: z.enum(LOCALE_VALUES),
});

export type ProfileInput = z.infer<typeof profileSchema>;

export type ProfileErrorCode =
  | "displayNameRequired"
  | "displayNameTooLong"
  | "nameRequired"
  | "nameTooLong"
  | "avatarInvalid"
  | "avatarTooLong"
  | "unsupportedLocale"
  | "profileInvalid"
  | "accountNotFound";

export type UpdateProfileResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid" | "not_found";
      code: ProfileErrorCode;
      field?: string;
    };

function profileIssueCode(issue: z.ZodIssue): ProfileErrorCode {
  const field = issue.path[0];
  if (field === "displayName") {
    if (issue.code === "too_small") return "displayNameRequired";
    if (issue.code === "too_big") return "displayNameTooLong";
  }
  if (field === "name") {
    if (issue.code === "too_small") return "nameRequired";
    if (issue.code === "too_big") return "nameTooLong";
  }
  if (field === "image") {
    if (issue.code === "too_big") return "avatarTooLong";
    return "avatarInvalid";
  }
  if (field === "locale") return "unsupportedLocale";
  return "profileInvalid";
}

/**
 * Update the actor's own profile row. Returns a discriminated result
 * so the server action can map `field` back to the form input id
 * (for focus + `aria-describedby`).
 */
export async function updateOwnProfile(userId: string, raw: unknown): Promise<UpdateProfileResult> {
  const parsed = profileSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = typeof issue?.path[0] === "string" ? issue.path[0] : undefined;
    return {
      ok: false,
      reason: "invalid",
      ...(field ? { field } : {}),
      code: issue ? profileIssueCode(issue) : "profileInvalid",
    };
  }
  const { displayName, name, image, locale } = parsed.data;
  const updated = await db
    .update(users)
    .set({
      displayName,
      name: name ?? displayName, // never null — derive from displayName
      image: image ?? null,
      locale,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning({ id: users.id });
  if (updated.length === 0) {
    return { ok: false, reason: "not_found", code: "accountNotFound" };
  }
  return { ok: true };
}

// ─── Password change / set ────────────────────────────────────────────────

export type ChangePasswordResult =
  | { ok: true; mode: "set" | "change" }
  | {
      ok: false;
      reason: "weak" | "mismatch" | "current_wrong" | "not_found";
      code:
        | "passwordWeak"
        | "passwordMismatch"
        | "currentPasswordRequired"
        | "currentPasswordIncorrect"
        | "accountNotFound";
    };

/**
 * Change the actor's password, or set one if they don't have one yet
 * (OAuth-only sign-in). When the user has a stored `passwordHash`,
 * `current` MUST match it; otherwise the change is rejected. When
 * there is no stored hash, `current` is ignored and any non-empty
 * string is accepted.
 *
 * Returns `{ ok: true, mode }` so the caller can show the right
 * success copy ("Password set" vs "Password changed").
 */
export async function changeOwnPassword(
  userId: string,
  raw: { current?: string; next: string; confirm: string },
): Promise<ChangePasswordResult> {
  const { current, next, confirm } = raw;

  if (!isPasswordStrong(next)) {
    return {
      ok: false,
      reason: "weak",
      code: "passwordWeak",
    };
  }
  if (next !== confirm) {
    return { ok: false, reason: "mismatch", code: "passwordMismatch" };
  }

  const [existing] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing) {
    return { ok: false, reason: "not_found", code: "accountNotFound" };
  }

  if (existing.passwordHash) {
    if (!current) {
      return { ok: false, reason: "current_wrong", code: "currentPasswordRequired" };
    }
    const ok = await verifyPassword(current, existing.passwordHash);
    if (!ok) {
      return {
        ok: false,
        reason: "current_wrong",
        code: "currentPasswordIncorrect",
      };
    }
  }

  await setPassword(userId, next);
  return { ok: true, mode: existing.passwordHash ? "change" : "set" };
}

/** Read the actor's stored state for the password card. */
export async function getPasswordState(userId: string): Promise<{ hasPassword: boolean } | null> {
  const [row] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) return null;
  return { hasPassword: !!row.passwordHash };
}
