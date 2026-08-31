import Link from "next/link";
import { AlertCircle, Wrench } from "lucide-react";
import { DirAwareArrowLeft } from "@/components/ui/dir-aware-icon";
import { authError } from "./auth-error-codes";
import {
  signInWithGoogleAction,
  signInWithMagicLinkAction,
  signInWithPasswordAction,
} from "./actions";
import { SignInOptions } from "./signin-options";
import { serverEnv } from "@/lib/validation/env";

export const metadata = { title: "Sign in" };

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
            aria-label="StudioFlow home"
          >
            <span className="bg-primary flex h-10 w-10 items-center justify-center rounded-[var(--radius-card)] text-base font-bold text-white">
              S
            </span>
            <span className="text-title-card text-fg-primary font-semibold">StudioFlow</span>
          </Link>
          <div className="space-y-2">
            <p className="text-label text-primary font-semibold tracking-wide uppercase">
              {setupMode ? "First-time setup" : "Welcome back"}
            </p>
            <h1
              id="signin-title"
              className="text-title-page text-fg-primary font-semibold tracking-tight"
            >
              {setupMode ? "Sign in to start setup" : "Sign in to your workspace"}
            </h1>
            <p className="text-body text-fg-secondary mx-auto max-w-sm">
              {setupMode
                ? "Verify your identity before creating the first agency administrator."
                : "Continue to planning, reviews, and publishing."}
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
                <span className="text-label font-semibold">We couldn&apos;t sign you in</span>
                <span className="text-body">{authError(params.error)}</span>
                {params.ref ? (
                  <span
                    data-testid="signin-error-ref"
                    className="text-label text-fg-muted mt-1 font-mono"
                  >
                    Reference: {params.ref}
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
              <p className="text-label font-semibold">Setup sign-in is not configured</p>
              <p className="text-body mt-1">
                Configure Google OAuth or SMTP before creating the first administrator.
              </p>
            </div>
          ) : null}

          <SignInOptions
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
            Developer mode ·
            <Link
              href="/dev/signin"
              className="text-primary font-semibold underline-offset-4 hover:underline"
            >
              use one-click sign-in
            </Link>
          </p>
        ) : null}

        <footer className="space-y-3 text-center">
          <p className="text-label text-fg-secondary">
            Invitation-only access. Contact your agency administrator if you need an account.
          </p>
          <nav
            aria-label="Legal"
            className="text-label text-fg-muted flex flex-wrap justify-center gap-x-4 gap-y-2"
          >
            <Link
              href="/privacy"
              className="hover:text-fg-primary underline-offset-4 hover:underline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hover:text-fg-primary underline-offset-4 hover:underline"
            >
              Terms
            </Link>
            <Link
              href="/data-deletion"
              className="hover:text-fg-primary underline-offset-4 hover:underline"
            >
              Data deletion
            </Link>
          </nav>
          <Link
            href="/"
            className="text-label text-primary inline-flex items-center gap-1 font-medium underline-offset-4 hover:underline"
          >
            <DirAwareArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to home
          </Link>
        </footer>
      </section>
    </main>
  );
}
