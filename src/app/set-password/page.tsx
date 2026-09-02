import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { SetPasswordForm, type FirstLoginSetPasswordCopy } from "./set-password-form";
import { tForActive } from "@/lib/i18n/t-for-active";

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
 *
 * All user-visible copy is sourced from the message catalog and
 * handed to the client form as a typed `copy` prop. The action
 * returns locale-resolved error strings; the client never reads
 * the catalog itself.
 */
export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("auth.firstLoginSetPassword.title") };
}

export default async function SetPasswordPage() {
  const { t } = await tForActive();
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/signin");
  }
  if (!session.user.mustChangePassword) {
    redirect("/app");
  }

  const copy: FirstLoginSetPasswordCopy = {
    errorTitle: t("auth.firstLoginSetPassword.errorTitle"),
    successTitle: t("auth.firstLoginSetPassword.successTitle"),
    successBody: t("auth.firstLoginSetPassword.successBody"),
    newPasswordLabel: t("auth.firstLoginSetPassword.newPasswordLabel"),
    newPasswordHint: t("auth.firstLoginSetPassword.newPasswordHint"),
    confirmLabel: t("auth.firstLoginSetPassword.confirmLabel"),
    submit: t("auth.firstLoginSetPassword.submit"),
    submitPending: t("auth.firstLoginSetPassword.submitPending"),
  };

  return (
    <main className="bg-surface flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6" data-testid="set-password-page">
        <div className="space-y-1 text-center">
          <h1 className="text-heading text-fg-primary">{t("auth.firstLoginSetPassword.title")}</h1>
          <p className="text-body text-fg-secondary">{t("auth.firstLoginSetPassword.body")}</p>
        </div>
        <SetPasswordForm copy={copy} />
        <div className="text-center">
          <Link
            href="/signout"
            className="text-fg-muted text-label hover:text-fg-secondary focus-visible:ring-focus-ring inline-block rounded-sm focus:outline-none focus-visible:ring-2"
            data-testid="set-password-signout-link"
          >
            {t("auth.firstLoginSetPassword.signOut")}
          </Link>
        </div>
      </div>
    </main>
  );
}
