import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  agencySocialMetricProbes,
  socialChannels,
  socialConnections,
  workspaces,
} from "@/lib/db/schema";
import { isSocialProviderError } from "./http";
import { getAgencyProviderConfig } from "./provider-config";
import { openConnectionCredentials } from "./repository";
import { createDekCache, getDekForWorkspace } from "./key-management";
import { metaAdapter, probeMetaPermissions } from "./providers/meta";
import {
  resolveMetricStatus,
  getSupportedSocialMetrics,
  type MetricStatus,
  type SocialMetric,
} from "./metrics";
import type { SocialPlatform } from "./types";

const PROBE_METRICS: SocialMetric[] = [
  "followerCount",
  "reach",
  "views",
  "interactions",
  "engagedAccounts",
];

export type AnalyticsProbeProfile = {
  channelId: string;
  workspaceId: string;
  workspaceName: string;
  accountName: string;
  platform: Extract<SocialPlatform, "facebook" | "instagram" | "tiktok">;
};

export async function listAnalyticsProbeProfiles(
  agencyId: string,
): Promise<AnalyticsProbeProfile[]> {
  const rows = await db
    .select({
      channelId: socialChannels.id,
      workspaceId: workspaces.id,
      workspaceName: workspaces.name,
      accountName: socialChannels.accountName,
      platform: socialChannels.platform,
    })
    .from(socialChannels)
    .innerJoin(workspaces, eq(workspaces.id, socialChannels.workspaceId))
    .innerJoin(socialConnections, eq(socialConnections.id, socialChannels.socialConnectionId))
    .where(
      and(
        eq(workspaces.agencyId, agencyId),
        eq(socialConnections.provider, "meta"),
        isNull(socialConnections.revokedAt),
        eq(socialChannels.connectionStatus, "connected"),
        isNull(socialChannels.archivedAt),
      ),
    );
  return rows.map((row) => ({
    ...row,
    platform: row.platform as AnalyticsProbeProfile["platform"],
  }));
}

export type AnalyticsProbeResult = {
  profile: AnalyticsProbeProfile;
  permissions: Array<{ permission: string; status: string }>;
  metrics: Partial<Record<SocialMetric, MetricStatus>>;
  testedAt: string;
};

export async function runAnalyticsProbe(
  agencyId: string,
  channelId: string,
): Promise<AnalyticsProbeResult | null> {
  const [row] = await db
    .select({ channel: socialChannels, connection: socialConnections, workspace: workspaces })
    .from(socialChannels)
    .innerJoin(workspaces, eq(workspaces.id, socialChannels.workspaceId))
    .innerJoin(socialConnections, eq(socialConnections.id, socialChannels.socialConnectionId))
    .where(
      and(
        eq(socialChannels.id, channelId),
        eq(workspaces.agencyId, agencyId),
        eq(socialConnections.provider, "meta"),
        isNull(socialConnections.revokedAt),
        eq(socialChannels.connectionStatus, "connected"),
        isNull(socialChannels.archivedAt),
      ),
    )
    .limit(1);
  if (!row) return null;

  const profile: AnalyticsProbeProfile = {
    channelId: row.channel.id,
    workspaceId: row.workspace.id,
    workspaceName: row.workspace.name,
    accountName: row.channel.accountName,
    platform: row.channel.platform as AnalyticsProbeProfile["platform"],
  };
  const testedAt = new Date();
  const statuses: Partial<Record<SocialMetric, MetricStatus>> = {};
  const config = await getAgencyProviderConfig(db, agencyId, "meta");
  if (!("appId" in config) || !config.enabled) {
    for (const metric of getSupportedSocialMetrics(profile.platform)) {
      statuses[metric] = { status: "error", providerErrorCode: "provider_not_configured" };
    }
    await persistProbe(agencyId, profile, statuses, testedAt);
    return { profile, permissions: [], metrics: statuses, testedAt: testedAt.toISOString() };
  }

  const dek = await getDekForWorkspace(db, createDekCache(db), row.workspace.id);
  const credentials = openConnectionCredentials(row.connection, dek);
  let permissions: Array<{ permission: string; status: string }> = [];
  try {
    const permissionResult = await probeMetaPermissions({
      accessToken: credentials.accessToken,
      apiVersion: config.graphApiVersion,
    });
    permissions = permissionResult.permissions;
  } catch {
    // The per-metric snapshot below remains the source of truth for
    // sanitized failure classification; permission probe failure itself
    // is not allowed to expose provider payloads or abort diagnostics.
  }

  try {
    const snapshot = await metaAdapter.fetchSnapshot(
      {
        providerAccountId: row.channel.externalAccountId ?? "",
        platform: profile.platform,
        parentProviderAccountId: null,
      },
      credentials,
      config,
    );
    for (const metric of PROBE_METRICS) {
      statuses[metric] = resolveMetricStatus({
        platform: profile.platform,
        metric,
        value: snapshot[metric] as number | null,
        sourceMetadata: snapshot.sourceMetadata,
      });
    }
  } catch (error) {
    const errorCode = isSocialProviderError(error) ? error.code : "provider_unavailable";
    for (const metric of getSupportedSocialMetrics(profile.platform)) {
      statuses[metric] = {
        status: "error",
        providerErrorCode: errorCode,
        ...(isSocialProviderError(error) && error.requestId
          ? { providerRequestId: error.requestId }
          : {}),
      };
    }
  }
  await persistProbe(agencyId, profile, statuses, testedAt);
  return { profile, permissions, metrics: statuses, testedAt: testedAt.toISOString() };
}

async function persistProbe(
  agencyId: string,
  profile: AnalyticsProbeProfile,
  statuses: Partial<Record<SocialMetric, MetricStatus>>,
  testedAt: Date,
) {
  const values = getSupportedSocialMetrics(profile.platform).map((metric) => {
    const status = statuses[metric] ?? { status: "no_data" as const };
    return {
      agencyId,
      workspaceId: profile.workspaceId,
      socialChannelId: profile.channelId,
      provider: "meta",
      platform: profile.platform,
      metric,
      status: status.status,
      providerErrorCode: status.providerErrorCode ?? null,
      providerRequestId: status.providerRequestId ?? null,
      retryable:
        status.providerErrorCode === "provider_unavailable" ||
        status.providerErrorCode === "rate_limited",
      testedAt,
    };
  });
  if (values.length === 0) return;
  for (const value of values) {
    await db
      .insert(agencySocialMetricProbes)
      .values(value)
      .onConflictDoUpdate({
        target: [agencySocialMetricProbes.socialChannelId, agencySocialMetricProbes.metric],
        set: {
          status: value.status,
          providerErrorCode: value.providerErrorCode,
          providerRequestId: value.providerRequestId,
          retryable: value.retryable,
          testedAt,
          updatedAt: testedAt,
        },
      });
  }
}
