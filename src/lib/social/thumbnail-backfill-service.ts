import "server-only";

import { and, eq } from "drizzle-orm";
import { db as appDb } from "@/lib/db";
import { socialChannels, socialConnections, workspaces } from "@/lib/db/schema";
import { createDekCache, getDekForWorkspace } from "@/lib/social/key-management";
import { getAgencyProviderConfig } from "@/lib/social/provider-config";
import { openConnectionCredentials } from "@/lib/social/repository";
import {
  backfillMissingThumbnails,
  countPostsMissingThumbnails,
  type ThumbnailBackfillResult,
} from "@/lib/social/thumbnail-backfill";

type Db = typeof appDb;

export interface WorkspaceBackfillReport extends ThumbnailBackfillResult {
  workspaceId: string;
  /** Why this workspace could not be processed, when applicable. */
  skipped: "provider_not_configured" | "no_credentials" | null;
}

/**
 * Backfill missing post thumbnails for one workspace.
 *
 * The credential chain here is deliberately the SAME one the social sync and
 * the analytics probe already use — workspace → agency DEK → connection
 * credentials → access token. Duplicating that key unwrapping in a script or
 * a route would create a second path to a plaintext provider token, which is
 * exactly the kind of duplication that turns into a security incident.
 */
export async function backfillWorkspaceThumbnails(
  database: Db,
  workspaceId: string,
  options: { limit?: number; apiVersion?: string | null } = {},
): Promise<WorkspaceBackfillReport> {
  const empty = (skipped: WorkspaceBackfillReport["skipped"]): WorkspaceBackfillReport => ({
    workspaceId,
    candidates: 0,
    updated: 0,
    stillMissing: 0,
    failed: [],
    skipped,
  });

  const [workspace] = await database
    .select({ id: workspaces.id, agencyId: workspaces.agencyId })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace) return empty("no_credentials");

  // A channel that still has observations missing images is the signal we care
  // about; resolve its connection so we ask the provider as that channel.
  const [channel] = await database
    .select({ id: socialChannels.id, socialConnectionId: socialChannels.socialConnectionId })
    .from(socialChannels)
    .where(
      and(
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.connectionStatus, "connected"),
      ),
    )
    .limit(1);
  if (!channel?.socialConnectionId) return empty("no_credentials");

  const config = await getAgencyProviderConfig(database, workspace.agencyId, "meta");
  if (!("appId" in config) || !config.enabled) return empty("provider_not_configured");

  const connection = await database
    .select()
    .from(socialConnections)
    .where(eq(socialConnections.id, channel.socialConnectionId))
    .limit(1);
  if (connection.length === 0) return empty("no_credentials");

  const dek = await getDekForWorkspace(database, createDekCache(database), workspaceId);
  const credentials = openConnectionCredentials(
    connection[0] as typeof socialConnections.$inferSelect,
    dek,
  );

  const result = await backfillMissingThumbnails(database, workspaceId, credentials.accessToken, {
    ...(options.limit === undefined ? {} : { limit: options.limit }),
    apiVersion: options.apiVersion ?? ("graphApiVersion" in config ? config.graphApiVersion : null),
  });
  return { ...result, workspaceId, skipped: null };
}

/** Report the backlog for a workspace without calling any provider. */
export async function reportMissingThumbnails(database: Db, workspaceId: string): Promise<number> {
  return countPostsMissingThumbnails(database, workspaceId);
}
