"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";
import { useParams } from "next/navigation";
import { RouteErrorState } from "@/components/feedback/route-error-state";
import { getClientT } from "@/lib/i18n/client-locale";
import { workspaceBasePath } from "@/lib/urls";

export default function CommunityEngagementError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = getClientT();
  const params = useParams<{ agencySlug: string; slug: string }>();
  const communityHref = params?.slug
    ? `${workspaceBasePath(params.agencySlug, params.slug)}/engagement`
    : "/app";

  React.useEffect(() => {
    Sentry.captureException(error, { tags: { section: "community-inbox" } });
  }, [error]);

  return (
    <RouteErrorState
      title={t("communityInbox.errorTitle")}
      description={t("communityInbox.errorDescription")}
      reset={reset}
      backHref={communityHref}
      backLabel={t("communityInbox.backToCommunity")}
      errorDigest={error.digest}
      dataTestId="community-inbox-error"
    />
  );
}
