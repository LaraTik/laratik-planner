"use client";

import * as Sentry from "@sentry/nextjs";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { RouteErrorState } from "@/components/feedback/route-error-state";
import { getClientT } from "@/lib/i18n/client-locale";
import { workspaceBasePath } from "@/lib/urls";

export default function AdvertisingAnalyticsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = getClientT();
  const params = useParams<{ agencySlug: string; slug: string }>();
  const backHref = params?.slug
    ? `${workspaceBasePath(params.agencySlug, params.slug)}/analytics/advertising`
    : "/app";

  useEffect(() => {
    Sentry.captureException(error, { tags: { section: "advertising-reporting" } });
  }, [error]);

  return (
    <RouteErrorState
      title={t("errors.advertisingReportingTitle")}
      description={t("errors.advertisingReportingDescription")}
      reset={reset}
      backHref={backHref}
      backLabel={t("errors.backToAdvertisingReporting")}
      errorDigest={error.digest}
      dataTestId="advertising-reporting-error"
    />
  );
}
