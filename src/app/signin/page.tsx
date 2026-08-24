import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { signIn } from "@/lib/auth/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { AlertCircle, Wrench } from "lucide-react";
import { authError } from "./auth-error-codes";
import { serverEnv } from "@/lib/validation/env";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { headers } from "next/headers";

/**
 * Zod schema for the sign-in email input. We reject obvious non-emails
 * at the server boundary so a malformed value doesn't waste a rate-limit
 * slot or trigger an upstream Credentials provider error that the user
 * would see as a generic "email or password wrong" — the failure mode is
 * the same either way, but the server log is cleaner and the early
 * redirect saves a DB roundtrip in `findUserByEmailAndPassword`.
 */
const SignInEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/**
 * Sign-in page (Goal 2).
 *
 * Three entry paths:
 *  1. Email + password (Credentials provider, the primary path per
 *     the Stitch design)
 *  2. "Sign in with Google" — OAuth (secondary, shown below the
 *     primary card on the same page)
 *  3. "Email me a sign-in link" — passwordless magic link via
 *     Mailcow (secondary, shown below the primary card on the same
 *     page)
 *
 * Tradeoff: the Stitch design is a single card focused on email +
 * password. Keeping Google + magic-link on this page (rather than
 * moving them to /signin/providers) keeps the page count low and
 * the sign-in flow single-page for users who can't remember their
 * password. The Google + magic-link options are visually de-
 * emphasized below a horizontal divider so the password card is the
 * focal point.
 *
 * After successful sign-in, the NextAuth callback redirects to:
 *  - /setup if no agency exists yet (first admin)
 *  - /app otherwise
 */
export const metadata = { title: "Sign in" };

type SearchParams = {
  callbackUrl?: string;
  error?: string;
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const callbackUrl =
    sp.callbackUrl?.startsWith("/") && !sp.callbackUrl.startsWith("//") ? sp.callbackUrl : "/app";
  const errorCode = sp.error;
  const googleEnabled = !!(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET);
  const emailEnabled = !!(
    serverEnv.SMTP_HOST &&
    serverEnv.SMTP_USER &&
    serverEnv.SMTP_PASSWORD &&
    serverEnv.SMTP_FROM
  );
  const hasSecondary = googleEnabled || emailEnabled;

  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
      data-testid="signin-page"
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
          laratik-planner
        </p>
        <h1 className="text-title-page text-primary font-bold tracking-tight">Sign in</h1>
        <p className="text-body text-fg-secondary max-w-sm">
          StudioFlow · Plan, approve, and publish with clarity.
        </p>
      </header>

      <div className="w-full space-y-3">
        <div className="border-border bg-surface rounded-[var(--radius-card)] border p-8 shadow-sm">
          {errorCode ? (
            <div
              role="alert"
              data-testid="signin-error"
              className="border-danger/20 bg-danger-subtle text-danger mb-5 flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col">
                <span className="text-label font-semibold">Sign-in failed</span>
                <span className="text-body">{authError(errorCode)}</span>
              </div>
            </div>
          ) : null}

          {serverEnv.NODE_ENV !== "production" ? (
            <div
              role="note"
              className="border-warning/20 bg-warning-subtle text-warning mb-5 flex items-start gap-3 rounded-[var(--radius-control)] border p-3 text-sm"
            >
              <Wrench className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Dev mode:{" "}
                <Link
                  href="/dev/signin"
                  className="font-semibold underline-offset-4 hover:underline"
                >
                  one-click sign-in
                </Link>{" "}
                bypasses Google and SMTP (returns 404 in production builds).
              </span>
            </div>
          ) : null}

          <form
            action={async (formData) => {
              "use server";
              const rawEmail = String(formData.get("email") ?? "");
              const password = String(formData.get("password") ?? "");
              const parsed = SignInEmailSchema.safeParse({ email: rawEmail });
              if (!parsed.success || !password) {
                redirect(
                  `/signin?error=CredentialsSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`,
                );
              }
              const email = parsed.data.email;
              // Rate-limit per (email, source IP) to throttle password
              // guessing. Same composite as magic-link so an attacker
              // can't rotate between the two to bypass the limit.
              const h = await headers();
              const requestId = h.get("x-request-id");
              const subject = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? email;
              const limit = await enforceRateLimit({
                scope: "magic_link_request",
                subject: `${email}::${subject}`,
                ...(requestId ? { requestId } : {}),
              });
              if (!limit.allowed) {
                redirect(
                  `/signin?error=CredentialsSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`,
                );
              }
              await signIn("credentials", {
                email,
                password,
                redirectTo: callbackUrl,
              });
            }}
            className="flex flex-col gap-5"
          >
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

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-label text-fg-primary font-medium">
                  Password
                </label>
                <Link
                  href="/signin/forgot-password"
                  className="text-body text-primary hover:text-primary-hover font-medium underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                name="password"
                autoComplete="current-password"
                required
                placeholder="Enter your password"
              />
            </div>

            <label className="text-label text-fg-primary flex items-center gap-2">
              <input
                id="remember"
                name="remember"
                type="checkbox"
                value="on"
                className="border-border text-primary focus:ring-focus-ring bg-surface h-4 w-4 cursor-pointer rounded"
              />
              Remember me for 30 days
            </label>

            <Button type="submit" className="mt-2 w-full" size="lg">
              Sign in
            </Button>
          </form>
        </div>

        {hasSecondary ? (
          <>
            <div className="flex items-center gap-3 py-2" role="separator" aria-label="or">
              <hr className="border-border flex-1" />
              <span className="text-label text-fg-muted">or</span>
              <hr className="border-border flex-1" />
            </div>

            {googleEnabled ? (
              <form
                action={async () => {
                  "use server";
                  await signIn("google", { redirectTo: callbackUrl });
                }}
              >
                <Button type="submit" variant="secondary" className="w-full" size="lg">
                  <GoogleIcon className="h-4 w-4" />
                  Continue with Google
                </Button>
              </form>
            ) : null}

            {emailEnabled ? (
              <form
                action={async (formData) => {
                  "use server";
                  const email = String(formData.get("email") ?? "").trim();
                  if (!email) return;
                  const h = await headers();
                  const requestId = h.get("x-request-id");
                  const subject = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? email;
                  const limit = await enforceRateLimit({
                    scope: "magic_link_request",
                    subject: `${email}::${subject}`,
                    ...(requestId ? { requestId } : {}),
                  });
                  if (!limit.allowed) {
                    redirect(
                      `/signin?error=EmailSignin&callbackUrl=${encodeURIComponent(callbackUrl)}`,
                    );
                  }
                  await signIn("nodemailer", { email, redirectTo: callbackUrl });
                }}
                className="space-y-2"
              >
                <Input
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  placeholder="Work email"
                />
                <Button type="submit" variant="secondary" className="w-full" size="lg">
                  Email me a sign-in link
                </Button>
              </form>
            ) : null}
          </>
        ) : null}
      </div>

      <footer className="flex flex-col items-center gap-3">
        <p className="text-label text-secondary text-center">
          Invitation-only access. Contact your agency administrator for an invitation.
        </p>
        <p className="text-label text-fg-muted text-center">
          © {new Date().getFullYear()} laratik-planner Agency Platform
        </p>
      </footer>
    </main>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M21.35 11.1H12v3.83h5.34c-.23 1.45-1.7 4.25-5.34 4.25-3.21 0-5.83-2.66-5.83-5.93s2.62-5.93 5.83-5.93c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 4.55 14.55 3.5 12 3.5 6.85 3.5 2.7 7.66 2.7 12.8s4.15 9.3 9.3 9.3c5.37 0 8.92-3.77 8.92-9.08 0-.61-.07-1.08-.17-1.92z"
        fill="currentColor"
      />
    </svg>
  );
}
