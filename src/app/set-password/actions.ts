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
    message: "The two passwords don't match.",
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
  const session = await auth();
  if (!session?.user?.id) {
    return { error: "Not signed in. Please sign in again." };
  }
  if (!session.user.mustChangePassword) {
    // Defensive: the middleware should have routed this user away
    // from /set-password. If they got here anyway, don't let them
    // re-run the flow.
    return { error: "You don't need to change your password." };
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
      fieldErrors[key].push(issue.message);
    }
    const firstMessage = parsed.error.issues[0]?.message ?? "Check the form values and try again.";
    return { error: firstMessage, fieldErrors };
  }
  if (!isPasswordStrong(parsed.data.newPassword)) {
    return {
      error: "Password must be at least 8 characters and contain a letter and a digit.",
      fieldErrors: { newPassword: ["Too weak."] },
    };
  }

  const rateLimit = await enforceRateLimit({
    scope: "password_reset_request",
    subject: session.user.id,
    actorId: session.user.id,
  });
  if (!rateLimit.allowed) {
    return {
      error: "Too many password changes. Try again in a few minutes.",
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
      error: "We couldn't update your password. The error has been logged. Please try again.",
    };
  }

  revalidatePath("/", "layout");
  return { saved: true };
}
