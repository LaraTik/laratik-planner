import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { communityCapabilities, socialChannels, socialConnections } from "@/lib/db/schema";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { createDekCache, getDekForWorkspace } from "@/lib/social/key-management";
import { openConnectionCredentials } from "@/lib/social/repository";
import {
  COMMUNITY_OPERATIONS,
  type CommunityCapabilityState,
  type CommunityOperation,
} from "./capabilities";
import { probeMetaCommunityCapabilities } from "./meta-capability-probe";

export type CommunityCapabilityValidationResult = {
  checkedConnections: number;
  checkedChannels: number;
  availableOperations: number;
  checkedAt: Date;
};

type OperationResult = { state: CommunityCapabilityState; detail?: string };

function mergeOperationResults(results: OperationResult[]): OperationResult {
  if (results.some((result) => result.state === "available")) return { state: "available" };
  const details = [
    ...new Set(
      results.flatMap((result) =>
        result.detail
          ? result.detail
              .split(",")
              .map((value) => value.trim())
              .filter((value) => value.length > 0)
          : [],
      ),
    ),
  ];
  const detail = details.length > 0 ? details.join(",") : undefined;
  if (results.length > 0 && results.every((result) => result.state === "unavailable")) {
    return detail ? { state: "unavailable", detail } : { state: "unavailable" };
  }
  return detail ? { state: "unknown", detail } : { state: "unknown" };
}

export async function validateCommunityCapabilities(
  agencyId: string,
  workspaceId: string,
): Promise<CommunityCapabilityValidationResult> {
  const channels = await db
    .select({
      channel: socialChannels,
      connection: socialConnections,
    })
    .from(socialChannels)
    .innerJoin(
      socialConnections,
      and(
        eq(socialConnections.id, socialChannels.socialConnectionId),
        eq(socialConnections.workspaceId, workspaceId),
        eq(socialConnections.provider, "meta"),
        eq(socialConnections.status, "active"),
        isNull(socialConnections.revokedAt),
      ),
    )
    .where(
      and(
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.connectionStatus, "connected"),
        isNull(socialChannels.archivedAt),
      ),
    );

  const config = await getAgencyProviderConfig(db, agencyId, "meta");
  if (!("appId" in config) || !config.enabled) {
    throw new Error("provider_not_configured");
  }

  const cache = createDekCache(db);
  const byConnection = new Map<string, (typeof channels)[number][]>();
  for (const row of channels) {
    const list = byConnection.get(row.connection.id) ?? [];
    list.push(row);
    byConnection.set(row.connection.id, list);
  }

  const checkedAt = new Date();
  let availableOperations = 0;
  for (const [connectionId, rows] of byConnection) {
    const connection = rows[0]?.connection;
    if (!connection) continue;
    const dek = await getDekForWorkspace(db, cache, workspaceId);
    const credentials = openConnectionCredentials(connection, dek);
    const operationResults = new Map<CommunityOperation, OperationResult[]>();
    for (const row of rows) {
      if (row.channel.platform !== "facebook" && row.channel.platform !== "instagram") continue;
      if (!row.channel.externalAccountId) continue;
      const accessToken =
        credentials.profileAccessTokens?.[row.channel.externalAccountId] ?? credentials.accessToken;
      const probe = await probeMetaCommunityCapabilities({
        platform: row.channel.platform,
        accountId: row.channel.externalAccountId,
        accessToken,
        apiVersion: config.graphApiVersion,
        grantedScopes: connection.scopes,
      });
      for (const operation of COMMUNITY_OPERATIONS) {
        const result = probe.operations[operation];
        const existing = operationResults.get(operation) ?? [];
        existing.push(result);
        operationResults.set(operation, existing);
      }
    }

    const values = COMMUNITY_OPERATIONS.map((operation) => {
      const result = mergeOperationResults(operationResults.get(operation) ?? []);
      if (result.state === "available") availableOperations += 1;
      return {
        workspaceId,
        socialConnectionId: connectionId,
        operation,
        state: result.state,
        providerVersion: config.graphApiVersion ?? "v26.0",
        checkedAt,
        detail: result.detail ?? null,
        updatedAt: checkedAt,
      };
    });
    for (const value of values) {
      await db
        .insert(communityCapabilities)
        .values(value)
        .onConflictDoUpdate({
          target: [communityCapabilities.socialConnectionId, communityCapabilities.operation],
          set: {
            state: value.state,
            providerVersion: value.providerVersion,
            checkedAt,
            detail: value.detail,
            updatedAt: checkedAt,
          },
        });
    }
  }

  return {
    checkedConnections: byConnection.size,
    checkedChannels: channels.length,
    availableOperations,
    checkedAt,
  };
}
