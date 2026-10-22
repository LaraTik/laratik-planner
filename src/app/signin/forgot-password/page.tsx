import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { requestPasswordResetAction } from "@/features/auth/server";
import { tForActive } from "@/lib/i18n/t-for-active";

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

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string }>;
}) {
  const { t } = await tForActive();
  const { sent } = await searchParams;
  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 pt-20 pb-16 sm:py-16"
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
          <form action={requestPasswordResetAction} className="flex flex-col gap-5">
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
