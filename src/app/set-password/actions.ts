"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { securityAuditEvents, users } from "@/lib/db/schema";
import { hashPassword, isPasswordStrong } from "@/lib/auth/password";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { captureError } from "@/lib/observability/sentry";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * Server action for /set-password — the first-login redirect target
 * for users created via the "Add directly" admin flow
 * (see lib/auth/user-creation.ts).
 *
 * This action is ONLY reachable when:
 *   1. the user is signed in (session is valid), AND
 *   2. `session.user.mustChangePassword === true` (the middleware
 *      redirects every other path away).
 *
 * It does NOT require the current password — the user just signed in
 * with the admin-supplied temporary password, which IS the current
 * one. The action validates the new password, hashes it, clears the
 * `mustChangePassword` flag in the same transaction, and writes a
 * `password_change` audit event.
 *
 * All user-visible error strings are resolved against the active
 * locale through `tForActive()` and returned to the client form
 * in the user's language. The catalog key namespace is
 * `auth.firstLoginSetPassword.*` so the strings move with the
 * rest of the auth surface's translation work.
 *
 * The JWT is NOT automatically refreshed by this action. The client
 * form calls `useSession().update({ mustChangePassword: false })` on
 * success, which re-invokes the `jwt` callback with
 * `trigger === "update"` — see `src/lib/auth/config.ts` where the
 * callback re-reads the column.
 */
const setPasswordSchema = z
  .object({
    newPassword: z.string(),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "auth.firstLoginSetPassword.mismatch",
    path: ["confirmPassword"],
  });

export type SetPasswordState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  saved?: boolean;
};

export async function setOwnPasswordAction(
  _prev: SetPasswordState | undefined,
  formData: FormData,
): Promise<SetPasswordState> {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) {
    return { error: t("auth.firstLoginSetPassword.notSignedIn") };
  }
  const [user] = await db
    .select({ mustChangePassword: users.mustChangePassword })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!user?.mustChangePassword) {
    // Defensive: the middleware should have routed this user away
    // from /set-password. If they got here anyway, don't let them
    // re-run the flow.
    return { error: t("auth.firstLoginSetPassword.notRequired") };
  }

  const parsed = setPasswordSchema.safeParse({
    newPassword: formData.get("newPassword"),
    confirmPassword: formData.get("confirmPassword"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
      if (!fieldErrors[key]) fieldErrors[key] = [];
      // The Zod error message is a catalog key. Resolve it
      // through the same translator so the field error and the
      // top-level error share a single source of copy.
      fieldErrors[key].push(t(issue.message));
    }
    const firstKey = parsed.error.issues[0]?.message ?? "auth.firstLoginSetPassword.weak";
    return { error: t(firstKey), fieldErrors };
  }
  if (!isPasswordStrong(parsed.data.newPassword)) {
    return {
      error: t("auth.firstLoginSetPassword.weak"),
      fieldErrors: { newPassword: [t("auth.firstLoginSetPassword.weak")] },
    };
  }

  const rateLimit = await enforceRateLimit({
    scope: "password_reset_request",
    subject: session.user.id,
    actorId: session.user.id,
  });
  if (!rateLimit.allowed) {
    return {
      error: t("auth.firstLoginSetPassword.weak"),
    };
  }

  try {
    const passwordHash = await hashPassword(parsed.data.newPassword);
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, mustChangePassword: false })
        .where(eq(users.id, session.user.id));
      await tx.insert(securityAuditEvents).values({
        actorId: session.user.id,
        action: "password_change",
        targetType: "user",
        targetId: session.user.id,
        outcome: "success",
        metadata: { source: "first_login_force_change" },
      });
    });
  } catch (err) {
    captureError("setPassword.firstLogin", err);
    return {
      error: t("auth.firstLoginSetPassword.weak"),
    };
  }

  revalidatePath("/", "layout");
  return { saved: true };
}
