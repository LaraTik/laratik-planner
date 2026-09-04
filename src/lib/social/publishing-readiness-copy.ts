import type { MetaPublishingReadiness } from "@/lib/db/schema";

type Translator = (key: string, params?: Record<string, string | number>) => string;

const STATUS_KEYS: Record<MetaPublishingReadiness["status"], string> = {
  not_configured: "not_configured",
  analytics_only: "analytics_only",
  not_enabled: "not_enabled",
  app_review_pending: "app_review_pending",
  business_verification_pending: "business_verification_pending",
  needs_reauth: "needs_reauth",
  ready: "ready",
  no_destinations: "no_destinations",
};

export function metaPublishingReadinessCopy(readiness: MetaPublishingReadiness, t: Translator) {
  const status = STATUS_KEYS[readiness.status];
  return {
    title: t("common.metaPublishing.title"),
    description: t("common.metaPublishing.description"),
    statusLabel: t(`common.metaPublishing.status.${status}`),
    statusDescription: t(`common.metaPublishing.descriptionByStatus.${status}`),
    analyticsLabel: t("common.metaPublishing.analyticsLabel"),
    analyticsDescription:
      readiness.status === "not_configured"
        ? t("common.metaPublishing.analyticsUnavailable")
        : t("common.metaPublishing.analyticsConnected"),
    publishingLabel: t("common.metaPublishing.publishingLabel"),
    publishingDescription: t(`common.metaPublishing.descriptionByStatus.${status}`),
    nextStepLabel: t("common.metaPublishing.nextStepLabel"),
    nextStepDescription: t(`common.metaPublishing.nextStepByStatus.${status}`),
  };
}
