import { signIn } from "@/lib/auth/config";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";

/**
 * Sign-in page (Goal 2).
 *
 * Two entry paths:
 *  1. "Sign in with Google" — OAuth redirect
 *  2. "Email me a sign-in link" — passwordless magic link via Mailcow
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
  const callbackUrl = sp.callbackUrl ?? "/app";
  const error = sp.error;

  // The form actions below use NextAuth's server action (`signIn`) — no
  // need to call `auth()` here since the proxy redirects signed-in users.

  return (
    <main className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16">
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
          laratik-planner
        </p>
        <h1 className="text-title-page text-fg-primary font-semibold tracking-tight">Sign in</h1>
        <p className="text-body text-fg-secondary max-w-sm">
          Use your work Google account, or get a one-time sign-in link by email.
        </p>
      </header>

      {error ? (
        <div
          role="alert"
          className="border-danger/20 bg-danger-subtle text-danger text-body w-full rounded-[var(--radius-card)] border px-4 py-3"
        >
          {decodeAuthError(error)}
        </div>
      ) : null}

      <div className="w-full space-y-3">
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: callbackUrl });
          }}
        >
          <Button type="submit" variant="default" className="w-full" size="lg">
            <GoogleIcon className="h-4 w-4" />
            Continue with Google
          </Button>
        </form>

        <div className="flex items-center gap-3 py-2">
          <hr className="border-border flex-1" />
          <span className="text-label text-fg-muted">or</span>
          <hr className="border-border flex-1" />
        </div>

        <form
          action={async (formData) => {
            "use server";
            const email = String(formData.get("email") ?? "").trim();
            if (!email) return;
            await signIn("nodemailer", { email, redirectTo: callbackUrl });
          }}
          className="space-y-3"
        >
          <FormField id="email" label="Work email" required>
            <Input
              type="email"
              name="email"
              autoComplete="email"
              required
              placeholder="you@company.com"
            />
          </FormField>
          <Button type="submit" variant="secondary" className="w-full" size="lg">
            Email me a sign-in link
          </Button>
        </form>
      </div>

      <p className="text-label text-fg-muted text-center">
        By continuing you agree to our{" "}
        <Link
          href="/legal/terms"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          terms
        </Link>{" "}
        and{" "}
        <Link
          href="/legal/privacy"
          className="text-primary underline underline-offset-4 hover:no-underline"
        >
          privacy policy
        </Link>
        .
      </p>
    </main>
  );
}

function decodeAuthError(code: string): string {
  switch (code) {
    case "AccessDenied":
      return "Access denied. Ask an admin to invite you.";
    case "Verification":
      return "The sign-in link is invalid or has expired.";
    case "Configuration":
      return "Auth is misconfigured. Contact an admin.";
    case "OAuthSignin":
    case "OAuthCallback":
    case "OAuthCreateAccount":
    case "EmailCreateAccount":
    case "Callback":
      return "Something went wrong with the sign-in. Please try again.";
    default:
      return "Could not sign you in. Please try again.";
  }
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
