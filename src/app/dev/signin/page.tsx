import { redirect } from "next/navigation";
import Link from "next/link";
import { serverEnv } from "@/lib/validation/env";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { FormSubmitButton } from "@/components/forms/form-submit-button";
import { devSignInAction } from "./actions";

/**
 * One-click dev sign-in (Goal 2 — local dev convenience).
 *
 * Renders ONLY when NODE_ENV !== "production". In a production build
 * the page redirects to /404 immediately. The form action is a server
 * action that upserts a user and signs a NextAuth JWT cookie, so this
 * is a zero-JS path.
 *
 * Use this page for:
 *  - The first run, when neither Google OAuth nor SMTP is configured
 *  - Switching between test users (admin vs member) without clearing cookies
 *  - E2E tests that need a stable session without going through providers
 *
 * For real sign-in use /signin (Google OAuth or magic link).
 */
export const metadata = { title: "Dev sign-in" };
export const dynamic = "force-dynamic";

type SearchParams = {
  callbackUrl?: string;
  email?: string;
};

export default async function DevSignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  if (serverEnv.NODE_ENV === "production") {
    redirect("/404");
  }

  const sp = await searchParams;
  const defaultEmail = sp.email?.trim() || "nizam.94@hotmail.com";
  const rawCallback = sp.callbackUrl ?? "/app";
  const callbackUrl =
    rawCallback.startsWith("/") && !rawCallback.startsWith("//") ? rawCallback : "/app";

  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
      data-testid="dev-signin-page"
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="border-warning/20 bg-warning-subtle text-warning text-label rounded-full border px-3 py-1">
          🛠 Dev mode — not available in production
        </p>
        <h1 className="text-title-page text-fg-primary font-semibold tracking-tight">
          One-click sign-in
        </h1>
        <p className="text-body text-fg-secondary max-w-sm">
          Creates (or reuses) a user, signs a 30-day NextAuth JWT cookie, and lands you in the app.
          Skips Google OAuth and SMTP. Equivalent to{" "}
          <code className="text-label bg-surface rounded px-1">POST /api/dev/sign-in</code>.
        </p>
      </header>

      <form action={devSignInAction} className="w-full space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <FormField id="email" label="Email" required>
          <Input
            type="email"
            name="email"
            required
            defaultValue={defaultEmail}
            autoComplete="email"
            autoFocus
            placeholder="you@company.com"
          />
        </FormField>
        <FormField id="name" label="Display name" hint="Defaults to the part before @ if blank.">
          <Input type="text" name="name" defaultValue="Nizam" maxLength={80} />
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label text-fg-secondary mb-1 font-medium">Role</legend>
          <label className="border-border bg-surface hover:bg-surface-subtle has-checked:border-primary has-checked:ring-primary flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border p-3 transition-colors has-checked:ring-1">
            <input
              type="radio"
              name="role"
              value="agency_admin"
              defaultChecked
              className="text-primary focus:ring-focus-ring h-4 w-4"
            />
            <span className="flex flex-col">
              <span className="text-body text-fg-primary font-medium">Agency admin</span>
              <span className="text-label text-fg-muted">
                Full access — can manage members, channels, brand kit
              </span>
            </span>
          </label>
          <label className="border-border bg-surface hover:bg-surface-subtle has-checked:border-primary has-checked:ring-primary flex cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border p-3 transition-colors has-checked:ring-1">
            <input
              type="radio"
              name="role"
              value="user"
              className="text-primary focus:ring-focus-ring h-4 w-4"
            />
            <span className="flex flex-col">
              <span className="text-body text-fg-primary font-medium">Member</span>
              <span className="text-label text-fg-muted">Regular user — workspace access only</span>
            </span>
          </label>
        </fieldset>
        <FormSubmitButton
          className="w-full"
          size="lg"
          label={`Sign in and go to ${callbackUrl}`}
          pendingLabel="Signing in…"
        />
      </form>

      <p className="text-label text-fg-muted text-center">
        <Link href="/signin" className="text-primary underline-offset-4 hover:underline">
          ← Back to /signin
        </Link>
      </p>
    </main>
  );
}
