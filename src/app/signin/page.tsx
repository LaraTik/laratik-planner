import Link from "next/link";
import { AlertCircle, Wrench } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { authError } from "./auth-error-codes";
import {
  signInWithGoogleAction,
  signInWithMagicLinkAction,
  signInWithPasswordAction,
} from "./actions";
import { SignInOptions, type SignInCopy } from "./signin-options";
import { serverEnv } from "@/lib/validation/env";
import { tForActive } from "@/lib/i18n/t-for-active";

export async function generateMetadata() {
  const { t } = await tForActive();
  return { title: t("auth.signin.title") };
}

type SearchParams = {
  callbackUrl?: string;
  error?: string;
  method?: string;
  ref?: string;
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { t } = await tForActive();
  const params = await searchParams;
  const callbackUrl =
    params.callbackUrl?.startsWith("/") && !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/app";
  const setupMode = callbackUrl === "/setup";
  const googleEnabled = !!(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET);
  const magicLinkEnabled = !!(
    serverEnv.SMTP_HOST &&
    serverEnv.SMTP_USER &&
    serverEnv.SMTP_PASSWORD &&
    serverEnv.SMTP_FROM
  );
  const initialMethod =
    params.method === "magic" || (setupMode && magicLinkEnabled) ? "magic" : "password";
  const passwordAction = signInWithPasswordAction.bind(null, callbackUrl);
  const googleAction = signInWithGoogleAction.bind(null, callbackUrl);
  const magicLinkAction = signInWithMagicLinkAction.bind(null, callbackUrl);

  // All copy the client-side form needs is pre-resolved on the
  // server and passed in as a single `copy` object. The client
  // component never reaches for the catalog itself; it cannot —
  // it has no access to `tForActive`. This is the canonical
  // pattern for a Server Component → Client Component handoff
  // of localized strings.
  const copy: SignInCopy = {
    emailLabel: t("auth.signin.emailLabel"),
    emailPlaceholder: t("auth.signin.emailPlaceholder"),
    passwordLabel: t("auth.signin.passwordLabel"),
    passwordPlaceholder: t("auth.signin.passwordPlaceholder"),
    showPassword: t("auth.signin.showPassword"),
    hidePassword: t("auth.signin.hidePassword"),
    forgotPassword: t("auth.signin.forgotPassword"),
    rememberMe: t("auth.signin.rememberMe"),
    submit: t("auth.signin.submit"),
    submitPending: t("auth.signin.submitPending"),
    magicEyebrow: t("auth.signin.magicEyebrow"),
    magicBody: t("auth.signin.magicBody"),
    magicSubmit: t("auth.signin.magicSubmit"),
    magicSubmitPending: t("auth.signin.magicSubmitPending"),
    magicSwitchToPassword: t("auth.signin.magicSwitchToPassword"),
    magicSwitchToMagic: t("auth.signin.magicSwitchToMagic"),
    orSeparator: t("auth.signin.orSeparator"),
    otherMethodsSeparator: t("auth.signin.otherMethodsSeparator"),
    googleSubmit: t("auth.signin.googleSubmit"),
    googleSubmitPending: t("auth.signin.googleSubmitPending"),
  };

  return (
    <main
      className="bg-canvas relative isolate flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 sm:px-6 sm:py-16"
      data-testid="signin-page"
    >
      <div
        aria-hidden="true"
        className="bg-primary-subtle absolute start-1/2 top-[-16rem] -z-10 h-[34rem] w-[34rem] -translate-x-1/2 rounded-full blur-3xl"
      />
      <section className="w-full max-w-md space-y-6" aria-labelledby="signin-title">
        <div className="flex flex-col items-center gap-4 text-center">
          <Link
            href="/"
            className="focus-visible:ring-focus-ring flex items-center gap-2.5 rounded-[var(--radius-control)] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-label={t("auth.productName")}
          >
            <span className="bg-primary flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] text-base font-bold text-white">
              S
            </span>
            <span className="text-title-card text-fg-primary font-semibold">
              {t("auth.productName")}
            </span>
          </Link>
          <div className="space-y-2">
            <p className="text-label text-primary font-semibold tracking-wide uppercase">
              {setupMode ? t("auth.signin.setupEyebrow") : t("auth.signin.eyebrow")}
            </p>
            <h1
              id="signin-title"
              className="text-title-page text-fg-primary font-semibold tracking-tight"
            >
              {setupMode ? t("auth.signin.setupTitle") : t("auth.signin.title")}
            </h1>
            <p className="text-body text-fg-secondary mx-auto max-w-sm">
              {setupMode ? t("auth.signin.setupSubtitle") : t("auth.signin.subtitle")}
            </p>
          </div>
        </div>

        <div className="border-border bg-surface rounded-[var(--radius-card)] border p-5 shadow-sm sm:p-8">
          {params.error ? (
            <div
              role="alert"
              data-testid="signin-error"
              className="border-danger/20 bg-danger-subtle text-danger mb-5 flex items-start gap-3 rounded-[var(--radius-control)] border p-3"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="flex flex-col">
                <span className="text-label font-semibold">{t("auth.signin.errorTitle")}</span>
                <span className="text-body">{authError(t, params.error)}</span>
                {params.ref ? (
                  <span
                    data-testid="signin-error-ref"
                    className="text-label text-fg-muted mt-1 font-mono"
                  >
                    {t("auth.signin.errorReference", { ref: params.ref })}
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {setupMode && !googleEnabled && !magicLinkEnabled ? (
            <div
              role="alert"
              className="border-warning/20 bg-warning-subtle text-warning mb-5 rounded-[var(--radius-control)] border p-3"
            >
              <p className="text-label font-semibold">{t("auth.signin.setupNotConfiguredTitle")}</p>
              <p className="text-body mt-1">{t("auth.signin.setupNotConfiguredBody")}</p>
            </div>
          ) : null}

          <SignInOptions
            copy={copy}
            passwordAction={passwordAction}
            googleAction={googleAction}
            magicLinkAction={magicLinkAction}
            googleEnabled={googleEnabled}
            magicLinkEnabled={magicLinkEnabled}
            passwordEnabled={!setupMode}
            initialMethod={initialMethod}
          />
        </div>

        {serverEnv.NODE_ENV !== "production" ? (
          <p className="text-label text-fg-muted flex items-center justify-center gap-1.5 text-center">
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
            {t("auth.signin.devModeNotice")}
            <Link
              href="/dev/signin"
              className="text-primary font-semibold underline-offset-4 hover:underline"
            >
              {t("auth.signin.devModeLink")}
            </Link>
          </p>
        ) : null}

        <footer className="space-y-3 text-center">
          <p className="text-label text-fg-secondary">{t("auth.signin.invitationFooter")}</p>
          <nav
            aria-label={t("auth.signin.legalLabel")}
            className="text-label text-fg-muted flex flex-wrap justify-center gap-x-4 gap-y-2"
          >
            <Link
              href="/privacy"
              className="hover:text-fg-primary underline-offset-4 hover:underline"
            >
              {t("auth.signin.privacy")}
            </Link>
            <Link
              href="/terms"
              className="hover:text-fg-primary underline-offset-4 hover:underline"
            >
              {t("auth.signin.terms")}
            </Link>
            <Link
              href="/data-deletion"
              className="hover:text-fg-primary underline-offset-4 hover:underline"
            >
              {t("auth.signin.dataDeletion")}
            </Link>
          </nav>
          <Link
            href="/"
            className="text-label text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />{" "}
            {t("auth.signin.backToHome")}
          </Link>
        </footer>
      </section>
    </main>
  );
}
