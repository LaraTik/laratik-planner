import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { issuePasswordResetToken } from "@/lib/auth/password";
import { sendEmail } from "@/lib/email";
import { clientEnv, serverEnv } from "@/lib/validation/env";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { headers } from "next/headers";

/**
 * Zod schema for the forgot-password email input. Rejecting obvious
 * non-emails at the server boundary prevents a malformed value from
 * being normalized to "" and slipping past the rate-limit + token
 * issuance branches (which already early-return on empty input).
 */
const ForgotEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

/**
 * Forgot-password page. The user enters their email; if a user with
 * that email exists, a signed reset link is emailed. The response
 * is intentionally identical whether or not the user exists, so the
 * page can't be used to enumerate accounts.
 */
export const metadata = { title: "Reset your password" };

async function requestResetAction(formData: FormData) {
  "use server";
  const rawEmail = String(formData.get("email") ?? "");
  const parsed = ForgotEmailSchema.safeParse({ email: rawEmail });
  // Anti-enumeration: respond identically on validation failure,
  // missing user, and success. The user only sees `?sent=1`.
  if (!parsed.success) {
    redirect("/signin/forgot-password?sent=1");
  }
  const email = parsed.data.email;

  // Throttle per (email, source IP) — same composite as the
  // sign-in rate limit so an attacker can't rotate IPs to spam
  // resets for one email.
  const h = await headers();
  const requestId = h.get("x-request-id");
  const subject = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? email;
  const limit = await enforceRateLimit({
    scope: "magic_link_request",
    subject: `forgot::${email}::${subject}`,
    ...(requestId ? { requestId } : {}),
  });
  if (!limit.allowed) {
    redirect("/signin/forgot-password?sent=1");
  }

  const issued = await issuePasswordResetToken(email);
  if (issued) {
    const resetUrl = `${serverEnv.AUTH_URL || clientEnv.NEXT_PUBLIC_APP_URL}/signin/set-password?token=${issued.raw}`;
    // Best-effort send (drop if SMTP not configured in dev)
    await sendEmail({
      to: email,
      subject: "Reset your laratik-planner password",
      text: `Someone (hopefully you) requested a password reset on laratik-planner.

Reset your password: ${resetUrl}

This link expires in 1 hour. If you didn't request this, you can ignore the email — your password will not change.`,
    });
  }
  redirect("/signin/forgot-password?sent=1");
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { sent } = await searchParams;
  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
      data-testid="forgot-password-page"
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
          laratik-planner
        </p>
        <h1 className="text-title-page text-primary font-bold tracking-tight">
          Reset your password
        </h1>
        <p className="text-body text-fg-secondary max-w-sm">
          We&apos;ll email you a link to set a new password if your account exists.
        </p>
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
              <span className="text-label font-semibold">Check your email</span>
              <span className="text-body">
                If an account exists for that address, we&apos;ve sent a password-reset link. The
                link expires in 1 hour.
              </span>
            </div>
          </div>
        ) : (
          <form action={requestResetAction} className="flex flex-col gap-5">
            <FormField id="email" label="Email address" required>
              <Input
                type="email"
                name="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="name@agency.com"
              />
            </FormField>
            <Button type="submit" size="lg" className="w-full">
              Send reset link
            </Button>
          </form>
        )}
      </div>

      <Button asChild variant="ghost" size="sm">
        <Link href="/signin">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to sign in
        </Link>
      </Button>
    </main>
  );
}
