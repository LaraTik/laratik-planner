import { Mail } from "lucide-react";
import Link from "next/link";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * Magic-link "check your email" page. NextAuth redirects here after the
 * user submits the email form on /signin.
 *
 * All visible copy is sourced from the message catalog. The page
 * has no client-side state and no form; it is the simplest
 * Server Component shape and the first surface a brand-new user
 * sees in the verification half of the magic-link flow.
 */
export const metadata = { title: "Check your email" };

export default async function VerifyRequestPage() {
  const { t } = await tForActive();
  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 py-16 text-center"
      data-testid="signin-verify-page"
    >
      <div className="border-border bg-surface rounded-full border p-3">
        <Mail className="text-primary h-6 w-6" aria-hidden="true" />
      </div>
      <h1 className="text-title-page text-fg-primary font-semibold tracking-tight">
        {t("auth.verify.title")}
      </h1>
      <p className="text-body text-fg-secondary max-w-sm">{t("auth.verify.body")}</p>
      <p className="text-label text-fg-muted">
        {t("auth.verify.didNotGet")}{" "}
        <Link
          href="/signin"
          className="text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 underline underline-offset-4 hover:no-underline focus:outline-none focus-visible:ring-2"
        >
          {t("auth.verify.tryAgain")}
        </Link>
        .
      </p>
    </main>
  );
}
