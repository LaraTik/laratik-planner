"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { AlertTriangle } from "lucide-react";
import { getClientT } from "@/lib/i18n/client-locale";

/**
 * Top-level error boundary (Next.js 13+ App Router).
 *
 * The framework calls this when a server component throws. We surface
 * a "Try again" button (resets the error boundary) plus escape hatches
 * to /signin (always reachable, even when /app is the broken page) and
 * /app (the user's normal destination). The full error is logged
 * server-side by Next.js already; we don't expose the message to the
 * user. The reference id is the Next.js error digest — distinct from
 * the support ref the form action in /signin mints, so a user might
 * quote either. Including both is overkill; we render the digest here
 * and the form-action ref on /signin.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Error boundary copy uses the public `laratik_locale` cookie
  // (set by the profile-save action and the public locale
  // switcher). On the server this returns the English translator;
  // on the client it resolves to whatever the visitor's most
  // recent preference was.
  const t = getClientT();
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <EmptyState
        icon={<AlertTriangle className="h-10 w-10" aria-hidden="true" />}
        title={t("errors.globalTitle")}
        description={t("errors.globalDescription")}
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button onClick={reset} variant="default">
              {t("errors.tryAgain")}
            </Button>
            <Button asChild variant="secondary">
              <Link href="/signin">{t("errors.backToSignIn")}</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/app">{t("errors.goToMyWork")}</Link>
            </Button>
          </div>
        }
      />
      {error.digest ? (
        <p data-testid="error-digest" className="text-label text-fg-muted mt-4 text-center">
          {t("errors.referenceLabel")}{" "}
          <code className="bg-surface-subtle rounded px-1.5 py-0.5 font-mono">{error.digest}</code>
        </p>
      ) : null}
    </div>
  );
}
