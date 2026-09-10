"use client";

import { useLocaleT } from "@/components/i18n/locale-provider";
import { RouteErrorState } from "@/components/feedback/route-error-state";

export default function AgencySettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useLocaleT();
  return (
    <RouteErrorState
      title={t("common.error.title")}
      description={t("common.error.body")}
      reset={reset}
      backHref="/app/agency-settings"
      backLabel={t("agencySettings.title")}
      errorDigest={error.digest}
      dataTestId="agency-settings-error"
    />
  );
}
