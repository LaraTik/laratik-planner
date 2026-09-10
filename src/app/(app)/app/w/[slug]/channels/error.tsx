"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { useParams } from "next/navigation";
import { RouteErrorState } from "@/components/feedback/route-error-state";
import { getClientT } from "@/lib/i18n/client-locale";

/**
 * Per-route error boundary for /app/w/[slug]/channels/*.
 *
 * Re-uses the (app) error UI (Try again, Back to My Work, sign out)
 * and adds a section-specific "Back to Channels" link so a user
 * mid-OAuth-picker or mid-edit can return to the channels list
 * without going all the way back to /app. Captures to Sentry with
 * the `section: channels` tag so the on-call view can group these
 * errors by surface.
 */
export default function ChannelsError({
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
  const channelsHref = params?.slug ? `/app/w/${params.slug}/channels` : "/app";

  React.useEffect(() => {
    Sentry.captureException(error, { tags: { section: "channels" } });
  }, [error]);

  return (
    <RouteErrorState
      title={t("errors.channelsTitle")}
      description={t("errors.channelsDescription")}
      reset={reset}
      backHref={channelsHref}
      backLabel={t("errors.backToChannels")}
      errorDigest={error.digest}
      dataTestId="channels-error"
    />
  );
}
