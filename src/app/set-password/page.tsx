import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { SetPasswordForm } from "./set-password-form";

/**
 * First-login password reset page.
 *
 * Reachable only by users whose `mustChangePassword` flag is true
 * (the proxy at `src/proxy.ts` redirects every other path away
 * while the flag is set; `/signin`, `/signout`, and the NextAuth
 * API endpoints are allowlisted). The page also defensive-checks
 * the flag on the server: if the user navigates here by bookmarking
 * it after the flag is already cleared, the server bounces them to
 * /app without rendering the form.
 *
 * The "Sign out instead" link is the explicit escape hatch: if
 * this page ever appears for a session the user did not initiate
 * (e.g. a hijacked cookie on a borrowed device), the user can sign
 * out without setting a new password. Without this escape, the only
 * way out is `delete authjs.session-token` from devtools.
 */
export const metadata = { title: "Set your password" };

export default async function SetPasswordPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  if (!session.user.mustChangePassword) {
    redirect("/app");
  }
  return (
    <main className="bg-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6" data-testid="set-password-page">
        <div className="space-y-1 text-center">
          <h1 className="text-heading text-fg-primary">Set your password</h1>
          <p className="text-body text-fg-secondary">
            Your account was created by an administrator. Choose a new password to continue — you
            won&apos;t need the temporary one again.
          </p>
        </div>
        <SetPasswordForm />
        <div className="text-center">
          <Link
            href="/signout"
            className="text-fg-muted text-label hover:text-fg-secondary focus-visible:ring-focus-ring inline-block rounded-sm focus:outline-none focus-visible:ring-2"
            data-testid="set-password-signout-link"
          >
            Not you? Sign out instead
          </Link>
        </div>
      </div>
    </main>
  );
}
