"use server";

import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { issuePasswordResetToken } from "@/lib/auth/password";
import { sendEmail } from "@/lib/email";
import { logWarn } from "@/lib/observability/logger";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { clientEnv, serverEnv } from "@/lib/validation/env";
import { tForActive } from "@/lib/i18n/t-for-active";
import { tForResolved } from "@/messages";

const forgotEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("auth.forgot.invalidEmail"),
});

/**
 * Always returns the same page state for a valid or unknown address. Delivery
 * and lookup failures are also kept behind the generic response so a mail
 * outage cannot become an account-existence oracle.
 */
export async function requestPasswordResetAction(formData: FormData): Promise<never> {
  const activeLocale = await tForActive();
  const parsed = forgotEmailSchema.safeParse({
    email: String(formData.get("email") ?? ""),
  });

  if (!parsed.success) {
    // Keep malformed requests indistinguishable from unknown accounts.
    void activeLocale.t(parsed.error.issues[0]?.message ?? "");
    redirect("/signin/forgot-password?sent=1");
  }

  const email = parsed.data.email;
  const requestHeaders = await headers();
  const requestId = requestHeaders.get("x-request-id");
  const source = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? email;
  const rateLimit = await enforceRateLimit({
    scope: "password_reset_request",
    subject: `forgot::${email}::${source}`,
    ...(requestId ? { requestId } : {}),
  });

  if (!rateLimit.allowed) {
    redirect("/signin/forgot-password?sent=1");
  }

  try {
    const issued = await issuePasswordResetToken(email);
    if (issued) {
      const [recipient] = await db
        .select({ locale: users.locale })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
      const translate = tForResolved(recipient?.locale ?? activeLocale.code);
      const resetUrl = `${serverEnv.AUTH_URL || clientEnv.NEXT_PUBLIC_APP_URL}/signin/set-password?token=${issued.raw}`;
      const expiresAt = new Date(issued.expiresAt).toISOString().slice(0, 10);

      await sendEmail({
        to: email,
        subject: translate("emails.passwordReset.subject"),
        text: translate("emails.passwordReset.body", { resetUrl, expiresAt }),
      });
    }
  } catch {
    // Do not log the transport error or recipient: provider exceptions may
    // contain address details. Keep a countable signal without exposing either.
    logWarn("auth.password_reset.request_failed");
  }

  redirect("/signin/forgot-password?sent=1");
}
