import type {
  MetaPublishingReadiness,
  MetaPublishingStatus,
  PublishCapabilitySummary,
  SocialConnectionCapability,
} from "@/lib/db/schema";

export type MetaPublishingConfigInput = {
  providerConfigured: boolean;
  providerEnabled: boolean;
  publishingEnabled: boolean;
  appReviewStatus: "not_requested" | "pending" | "approved" | "rejected";
  businessVerificationStatus: "not_required" | "not_started" | "pending" | "verified" | "rejected";
  platformEnabled: boolean;
  workspaceEnabled: boolean;
};

export type MetaCapabilityInput = Pick<
  SocialConnectionCapability,
  "operation" | "status" | "lastCheckedAt" | "lastErrorCode"
>;

function capabilitySummary(capability: MetaCapabilityInput): PublishCapabilitySummary {
  return {
    operation: capability.operation as PublishCapabilitySummary["operation"],
    status: capability.status as PublishCapabilitySummary["status"],
    lastCheckedAt: capability.lastCheckedAt,
    lastErrorCode: capability.lastErrorCode,
  };
}

/**
 * Pure, server-authoritative Meta readiness calculation. The function never
 * treats an analytics connection as publish-ready and never reads secrets.
 */
export function evaluateMetaPublishingReadiness(
  config: MetaPublishingConfigInput,
  capabilities: MetaCapabilityInput[],
  hasConnectedDestination: boolean,
): MetaPublishingReadiness {
  const summaries = capabilities.map(capabilitySummary);
  const publishCapabilities = summaries.filter(
    (capability) =>
      capability.operation === "facebook_page_publish" ||
      capability.operation === "instagram_content_publish",
  );
  const hasReauth = publishCapabilities.some((capability) => capability.status === "needs_reauth");
  const hasActive = publishCapabilities.some((capability) => capability.status === "active");

  let status: MetaPublishingStatus;
  const blockers: string[] = [];
  if (!config.providerConfigured || !config.providerEnabled) {
    status = "not_configured";
    blockers.push("meta_provider_not_configured");
  } else if (!config.platformEnabled || !config.workspaceEnabled || !config.publishingEnabled) {
    status = "not_enabled";
    blockers.push("meta_publishing_disabled");
  } else if (config.appReviewStatus !== "approved") {
    status = "app_review_pending";
    blockers.push("meta_app_review_pending");
  } else if (
    config.businessVerificationStatus !== "not_required" &&
    config.businessVerificationStatus !== "verified"
  ) {
    status = "business_verification_pending";
    blockers.push("meta_business_verification_pending");
  } else if (hasReauth) {
    status = "needs_reauth";
    blockers.push("meta_connection_needs_reauth");
  } else if (!hasConnectedDestination) {
    status = "no_destinations";
    blockers.push("meta_no_connected_destinations");
  } else if (!hasActive) {
    status = "analytics_only";
    blockers.push("meta_publish_capability_missing");
  } else {
    status = "ready";
  }

  return {
    status,
    canQueue: status === "ready",
    blockers,
    capabilities: summaries,
  };
}
