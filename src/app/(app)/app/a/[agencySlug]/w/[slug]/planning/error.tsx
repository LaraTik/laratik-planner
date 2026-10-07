"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { useParams } from "next/navigation";
import { RouteErrorState } from "@/components/feedback/route-error-state";
import { getClientT } from "@/lib/i18n/client-locale";

/**
 * Per-route error boundary for /app/w/[slug]/planning/*.
 *
 * Re-uses the (app) error UI (Try again, Back to My Work, sign out)
 * and adds a section-specific "Back to Planning" link so a user
 * deep in a planning detail page can return to the list without
 * going all the way back to /app. Captures to Sentry with the
 * `section: planning` tag so the on-call view can group these
 * errors by surface.
 */
export default function PlanningError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Error boundary copy uses the public `laratik_locale` cookie
  // (set by the profile-save action and the public locale
  // switcher). On the server this returns the English translator;
  // on the client it resolves to the visitor's most recent
  // preference.
  const t = getClientT();
  const params = useParams<{ slug: string }>();
  const planningHref = params?.slug ? `/app/w/${params.slug}/planning` : "/app";

  React.useEffect(() => {
    Sentry.captureException(error, { tags: { section: "planning" } });
  }, [error]);

  return (
    <RouteErrorState
      title={t("errors.planningTitle")}
      description={t("errors.planningDescription")}
      reset={reset}
      backHref={planningHref}
      backLabel={t("errors.backToPlanning")}
      errorDigest={error.digest}
      dataTestId="planning-error"
    />
  );
}
