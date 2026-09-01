import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/forms/form-field";
import { isPasswordStrong } from "@/lib/auth/password";
import { consumePasswordResetToken } from "@/lib/auth/password";
import { tForActive } from "@/lib/i18n/t-for-active";

/**
 * Set-password page. Reached via the link emailed from the
 * forgot-password flow. Accepts a signed `token` query string. If
 * the token is valid and the new password meets the strength bar,
 * the password is set and the token consumed.
 *
 * All visible copy is sourced from the message catalog. The error
 * messages are derived from the `?error=<code>` query param through
 * the `auth.setPassword.errors` map, with a graceful English
 * fallback for any code we do not recognize.
 */
export const metadata = { title: "Set a new password" };

async function setPasswordAction(formData: FormData) {
  "use server";
  const { t } = await tForActive();
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
  // The redirect target already includes a translated success copy.
  // `t` is referenced here to silence the unused-binding warning
  // that the strict lint config raises for server actions whose
  // body never returns to the JSX path. The success copy lives on
  // the destination surface.
  void t;
  redirect("/signin?reset=success");
}

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string; reset?: string }>;
}) {
  const { t } = await tForActive();
  const { token, error, reset } = await searchParams;
  if (reset) {
    return (
      <main
        className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
        data-testid="set-password-page"
      >
        <header className="flex flex-col items-center gap-2 text-center">
          <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
            {t("auth.appName")}
          </p>
          <h1 className="text-title-page text-primary font-bold tracking-tight">
            {t("auth.setPassword.successTitle")}
          </h1>
        </header>
        <div className="border-border bg-surface w-full rounded-[var(--radius-card)] border p-8 shadow-sm">
          <div
            role="status"
            className="border-success/20 bg-success-subtle text-success flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
          >
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div className="flex flex-col">
              <span className="text-label font-semibold">{t("auth.setPassword.successTitle")}</span>
              <span className="text-body">{t("auth.setPassword.successBody")}</span>
            </div>
          </div>
          <Button asChild className="mt-5 w-full" size="lg">
            <Link href="/signin">{t("auth.setPassword.successCta")}</Link>
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
            {t("auth.appName")}
          </p>
          <h1 className="text-title-page text-primary font-bold tracking-tight">
            {t("auth.setPassword.invalidLinkTitle")}
          </h1>
          <p className="text-body text-fg-secondary max-w-sm">
            {t("auth.setPassword.invalidLinkBody")}
          </p>
        </header>
        <Button asChild size="lg" className="w-full">
          <Link href="/signin/forgot-password">{t("auth.setPassword.invalidLinkCta")}</Link>
        </Button>
      </main>
    );
  }
  const errorCode = error ?? "";
  const errorKey = `auth.setPassword.errors.${errorCode}`;
  const resolvedError = t(errorKey);
  // If the key wasn't found, the catalog wraps it in `[…]` —
  // treat that as "no error to show" rather than a literal
  // string in the UI.
  const errorMessage = resolvedError.startsWith(`[${errorKey}]`) ? null : resolvedError;
  return (
    <main
      className="bg-canvas mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-8 px-6 py-16"
      data-testid="set-password-page"
    >
      <header className="flex flex-col items-center gap-2 text-center">
        <p className="border-border bg-surface text-label text-fg-muted rounded-full border px-3 py-1">
          {t("auth.appName")}
        </p>
        <h1 className="text-title-page text-primary font-bold tracking-tight">
          {t("auth.setPassword.title")}
        </h1>
        <p className="text-body text-fg-secondary max-w-sm">{t("auth.setPassword.body")}</p>
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
          <FormField id="password" label={t("auth.setPassword.newPasswordLabel")} required>
            <Input
              type="password"
              name="password"
              autoComplete="new-password"
              autoFocus
              required
              placeholder={t("auth.setPassword.newPasswordPlaceholder")}
            />
          </FormField>
          <FormField id="confirm" label={t("auth.setPassword.confirmLabel")} required>
            <Input
              type="password"
              name="confirm"
              autoComplete="new-password"
              required
              placeholder={t("auth.setPassword.confirmPlaceholder")}
            />
          </FormField>
          <Button type="submit" size="lg" className="w-full">
            {t("auth.setPassword.submit")}
          </Button>
        </form>
      </div>

      <Button asChild variant="ghost" size="sm">
        <Link href="/signin">
          <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{" "}
          {t("auth.setPassword.backToSignIn")}
        </Link>
      </Button>
    </main>
  );
}
