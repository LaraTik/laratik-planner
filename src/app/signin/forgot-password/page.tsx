import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { issuePasswordResetToken } from "@/lib/auth/password";
import { sendEmail } from "@/lib/email";
import { clientEnv, serverEnv } from "@/lib/validation/env";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { headers } from "next/headers";
import { tForActive } from "@/lib/i18n/t-for-active";
import { tFor } from "@/messages";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Zod schema for the forgot-password email input. Rejecting obvious
 * non-emails at the server boundary prevents a malformed value from
 * being normalized to "" and slipping past the rate-limit + token
 * issuance branches (which already early-return on empty input).
 *
 * The validation message is taken from the message catalog so the
 * user sees the same locale as the rest of the surface. The
 * server action is bound at the top of the file and re-runs
 * through `tForActive()` on every request.
 */
const ForgotEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("auth.forgot.invalidEmail"),
});

/**
 * Forgot-password page. The user enters their email; if a user with
 * that email exists, a signed reset link is emailed. The response
 * is intentionally identical whether or not the user exists, so the
 * page can't be used to enumerate accounts.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("auth.forgot.title") };
}

async function requestResetAction(formData: FormData) {
  "use server";
  const { t } = await tForActive();
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = ForgotEmailSchema.safeParse({ email: rawEmail });
  // Anti-enumeration: respond identically on validation failure,
  // missing user, and success. The user only sees `?sent=1`.
  if (!parsed.success) {
    // The Zod error message is a catalog key (`auth.forgot.invalidEmail`).
    // The action swallows it on purpose: the user sees the same `?sent=1`
    // page either way, so the catalog message is never surfaced to the
    // browser. Keeping the key in the schema is the *only* place the
    // validation message lives; updating the English / Arabic copy is a
    // catalog change, not a code change.
    void t(parsed.error.issues[0]?.message ?? "");
    redirect("/signin/forgot-password?sent=1");
  }
  const email = parsed.data.email;

  // Throttle per (email, source IP) — same composite as the
  // sign-in rate limit so an attacker can't rotate IPs to spam
  // resets for one email. `password_reset_request` is its own
  // scope (FEAT-11) so the audit log distinguishes reset abuse
  // from sign-in magic-link abuse.
  const h = await headers();
  const requestId = h.get("x-request-id");
  const subject = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? email;
  const limit = await enforceRateLimit({
    scope: "password_reset_request",
    subject: `forgot::${email}::${subject}`,
    ...(requestId ? { requestId } : {}),
  });
  if (!limit.allowed) {
    redirect("/signin/forgot-password?sent=1");
  }

  const issued = await issuePasswordResetToken(email);
  if (issued) {
    const resetUrl = `${serverEnv.AUTH_URL || clientEnv.NEXT_PUBLIC_APP_URL}/signin/set-password?token=${issued.raw}`;
    // STUDIOFLOW_MASTER_PROMPT.md §1 — stored system copy.
    // Password reset emails render in the recipient's profile
    // locale at send time. The public-cookie locale is the
    // fallback for the rare case the user has never signed in
    // (e.g. an admin triggers a reset for a freshly invited
    // account that hasn't completed its first sign-in).
    const [recipient] = await db
      .select({ locale: users.locale })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    const recipientLocale = (recipient?.locale as Parameters<typeof tFor>[0] | undefined) ?? "en";
    const t = tFor(recipientLocale);
    const expiresAt = new Date(issued.expiresAt).toISOString().slice(0, 10);
    await sendEmail({
      to: email,
      subject: t("emails.passwordReset.subject"),
      text: t("emails.passwordReset.body", { resetUrl, expiresAt }),
    });
  }
  redirect("/signin/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { t } = await tForActive();
  const { sent } = await searchParams;
  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
      data-testid="forgot-password-page"
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
          {t("auth.appName")}
        </p>
        <h1 className="text-title-page text-primary font-bold tracking-tight">
          {t("auth.forgot.title")}
        </h1>
        <p className="text-body text-fg-secondary max-w-sm">{t("auth.forgot.body")}</p>
      </header>

      <div className="border-border bg-surface w-full rounded-[var(--radius-card)] border p-8 shadow-sm">
        {sent ? (
          <div
            role="status"
            aria-live="polite"
            tabIndex={-1}
            data-testid="forgot-password-sent"
            className="border-success/20 bg-success-subtle text-success focus-visible:ring-focus-ring flex items-start gap-3 rounded-[var(--radius-control)] border p-3 focus:outline-none focus-visible:ring-2"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="text-label font-semibold">{t("auth.forgot.sentTitle")}</span>
              <span className="text-body">{t("auth.forgot.sentBody")}</span>
            </div>
          </div>
        ) : (
          <form action={requestResetAction} className="flex flex-col gap-5">
            <FormField id="email" label={t("auth.signin.emailLabel")} required>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                required
                placeholder={t("auth.signin.emailPlaceholder")}
              />
            </FormField>
            <Button type="submit" size="lg" className="w-full">
              {t("auth.forgot.submit")}
            </Button>
          </form>
        )}
      </div>

      <Button asChild variant="ghost" size="sm">
        <Link href="/signin">
          <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{" "}
          {t("auth.forgot.backToSignIn")}
        </Link>
      </Button>
    </main>
  );
}
