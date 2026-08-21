import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { isPasswordStrong } from "@/lib/auth/password";
import { consumePasswordResetToken } from "@/lib/auth/password";

/**
 * Set-password page. Reached via the link emailed from the
 * forgot-password flow. Accepts a signed `token` query string. If
 * the token is valid and the new password meets the strength bar,
 * the password is set and the token consumed.
 */
export const metadata = { title: "Set a new password" };

async function setPasswordAction(formData: FormData) {
  "use server";
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!token) {
    redirect("/signin/set-password?error=missing");
  }
  if (!password || !isPasswordStrong(password)) {
    redirect(`/signin/set-password?error=weak&token=${encodeURIComponent(token)}`);
  }
  if (password !== confirm) {
    redirect(`/signin/set-password?error=mismatch&token=${encodeURIComponent(token)}`);
  }
  const result = await consumePasswordResetToken(token, password);
  if (!result) {
    redirect("/signin/set-password?error=invalid");
  }
  redirect("/signin?reset=success");
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; reset?: string }>;
}) {
  const { token, error, reset } = await searchParams;
  if (reset) {
    return (
      <main
        className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
        data-testid="set-password-page"
      >
        <header className="flex flex-col items-center gap-2 text-center">
          <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
            laratik-planner
          </p>
          <h1 className="text-title-page text-primary font-bold tracking-tight">Password set</h1>
        </header>
        <div className="border-border bg-surface w-full rounded-[var(--radius-card)] border p-8 shadow-sm">
          <div
            role="status"
            className="border-success/20 bg-success-subtle text-success flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="text-label font-semibold">You&apos;re all set</span>
              <span className="text-body">
                Your password has been updated. Sign in with your new password.
              </span>
            </div>
          </div>
          <Button asChild className="mt-5 w-full" size="lg">
            <Link href="/signin">Go to sign in</Link>
          </Button>
        </div>
      </main>
    );
  }
  if (!token) {
    return (
      <main
        className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
        data-testid="set-password-page"
      >
        <header className="flex flex-col items-center gap-2 text-center">
          <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
            laratik-planner
          </p>
          <h1 className="text-title-page text-primary font-bold tracking-tight">
            Invalid reset link
          </h1>
          <p className="text-body text-fg-secondary max-w-sm">
            This link is missing its token. Request a new one from the forgot-password page.
          </p>
        </header>
        <Button asChild size="lg" className="w-full">
          <Link href="/signin/forgot-password">Request a new link</Link>
        </Button>
      </main>
    );
  }
  const errorMessage =
    error === "weak"
      ? "Password must be at least 8 characters and contain a letter and a digit."
      : error === "mismatch"
        ? "The two passwords don't match."
        : error === "invalid"
          ? "This reset link is invalid or has expired. Request a new one."
          : error === "missing"
            ? "Missing reset token. Use the link from your email."
            : null;
  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
      data-testid="set-password-page"
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
          laratik-planner
        </p>
        <h1 className="text-title-page text-primary font-bold tracking-tight">
          Set a new password
        </h1>
        <p className="text-body text-fg-secondary max-w-sm">
          Choose a password with at least 8 characters, including a letter and a digit.
        </p>
      </header>

      <div className="border-border bg-surface w-full rounded-[var(--radius-card)] border p-8 shadow-sm">
        {errorMessage ? (
          <div
            role="alert"
            className="border-danger/20 bg-danger-subtle text-danger mb-5 flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-body">{errorMessage}</span>
          </div>
        ) : null}

        <form action={setPasswordAction} className="flex flex-col gap-5">
          <input type="hidden" name="token" value={token} />
          <FormField id="password" label="New password" required>
            <Input
              type="password"
              name="password"
              autoComplete="new-password"
              autoFocus
              required
              placeholder="At least 8 characters"
            />
          </FormField>
          <FormField id="confirm" label="Confirm new password" required>
            <Input
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              placeholder="Type the new password again"
            />
          </FormField>
          <Button type="submit" size="lg" className="w-full">
            Set password
          </Button>
        </form>
      </div>

      <Button asChild variant="ghost" size="sm">
        <Link href="/signin">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to sign in
        </Link>
      </Button>
    </main>
  );
}
