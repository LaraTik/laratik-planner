import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencySocialProviderConfig,
  socialChannels,
  socialConnectionCapabilities,
  workspaceSettings,
  type MetaPublishingReadiness,
} from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import { evaluateMetaPublishingReadiness } from "./publishing-readiness";

const APP_REVIEW_STATUSES = ["not_requested", "pending", "approved", "rejected"] as const;
const BUSINESS_STATUSES = [
  "not_required",
  "not_started",
  "pending",
  "verified",
  "rejected",
] as const;

function oneOf<T extends readonly string[]>(
  value: string | null | undefined,
  values: T,
): T[number] {
  if (values.includes(value as T[number])) return value as T[number];
  return values[0] as T[number];
}

export async function getMetaPublishingReadinessForWorkspace(
  agencyId: string,
  workspaceId: string,
): Promise<MetaPublishingReadiness> {
  const [[provider], [settings], channels] = await Promise.all([
    db
      .select({
        enabled: agencySocialProviderConfig.enabled,
        publishingEnabled: agencySocialProviderConfig.publishingEnabled,
        appReviewStatus: agencySocialProviderConfig.appReviewStatus,
        businessVerificationStatus: agencySocialProviderConfig.businessVerificationStatus,
      })
      .from(agencySocialProviderConfig)
      .where(
        and(
          eq(agencySocialProviderConfig.agencyId, agencyId),
          eq(agencySocialProviderConfig.provider, "meta"),
        ),
      )
      .limit(1),
    db
      .select({ metaPublishingEnabled: workspaceSettings.metaPublishingEnabled })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1),
    db
      .select({ id: socialChannels.id, connectionStatus: socialChannels.connectionStatus })
      .from(socialChannels)
      .where(
        and(
          eq(socialChannels.workspaceId, workspaceId),
          inArray(socialChannels.platform, ["instagram", "facebook"]),
          isNull(socialChannels.archivedAt),
        ),
      ),
  ]);

  const channelIds = channels.map((channel) => channel.id);
  const capabilities = channelIds.length
    ? await db
        .select({
          operation: socialConnectionCapabilities.operation,
          status: socialConnectionCapabilities.status,
          lastCheckedAt: socialConnectionCapabilities.lastCheckedAt,
          lastErrorCode: socialConnectionCapabilities.lastErrorCode,
        })
        .from(socialConnectionCapabilities)
        .where(inArray(socialConnectionCapabilities.socialChannelId, channelIds))
    : [];

  return evaluateMetaPublishingReadiness(
    {
      providerConfigured: Boolean(provider),
      providerEnabled: provider?.enabled ?? false,
      publishingEnabled: provider?.publishingEnabled ?? false,
      appReviewStatus: oneOf(provider?.appReviewStatus, APP_REVIEW_STATUSES),
      businessVerificationStatus: oneOf(provider?.businessVerificationStatus, BUSINESS_STATUSES),
      platformEnabled: serverEnv.META_PUBLISHING_ENABLED,
      workspaceEnabled: settings?.metaPublishingEnabled ?? false,
    },
    capabilities,
    channels.some((channel) => channel.connectionStatus === "connected"),
  );
}
