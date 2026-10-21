import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import {
  researchBookmarks,
  researchCollections,
  researchTeardowns,
  researchWatchlistAccounts,
  socialChannels,
  socialPostObservations,
} from "@/lib/db/schema";
import { RESEARCH_METRICS_VERSION } from "@/lib/research/metrics";
import type { McpContext, McpToolResultHelpers } from "@/features/mcp/tool-contracts";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";

type ResearchToolDependencies = McpToolResultHelpers & {
  workspaceId: z.ZodType<string, z.ZodTypeDef, string>;
  requireScope: (context: McpContext, scope: McpTokenScope) => void;
  requireWorkspace: (
    context: McpContext,
    id: string,
  ) => Promise<{
    id: string;
    agencyId: string;
    name: string;
    slug: string;
    timezone: string;
    status: string;
  }>;
};

export function registerResearchTools(
  server: McpServer,
  context: McpContext,
  dependencies: ResearchToolDependencies,
) {
  const { workspaceId, responseFormat, requireScope, requireWorkspace, result, errorResult } =
    dependencies;

  server.registerTool(
    "laratik_planner_list_research",
    {
      title: "List workspace research",
      description:
        "Read the workspace's Meedro-style research shelf: visible collections, saved observed posts, reviewed teardowns, and source-only watchlist accounts. Provider media and raw provider bodies are never returned.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        item_kind: z
          .enum(["all", "collections", "bookmarks", "teardowns", "watchlist"])
          .default("all")
          .describe("Return one research kind or all four kinds. Default all."),
        limit: z.number().int().min(1).max(100).default(50),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ workspace_id, item_kind, limit, response_format }) => {
      try {
        requireScope(context, "content:read");
        const workspace = await requireWorkspace(context, workspace_id);
        const include = (kind: Exclude<typeof item_kind, "all">) =>
          item_kind === "all" || item_kind === kind;

        const collections = include("collections")
          ? await db
              .select({
                id: researchCollections.id,
                name: researchCollections.name,
                description: researchCollections.description,
                share_scope: researchCollections.shareScope,
                created_by: researchCollections.createdBy,
                created_at: researchCollections.createdAt,
              })
              .from(researchCollections)
              .where(
                and(
                  eq(researchCollections.workspaceId, workspace.id),
                  or(
                    eq(researchCollections.shareScope, "workspace"),
                    eq(researchCollections.createdBy, context.actor.id),
                  ),
                ),
              )
              .orderBy(desc(researchCollections.createdAt))
              .limit(limit)
          : [];

        const bookmarks = include("bookmarks")
          ? await db
              .select({
                id: researchBookmarks.id,
                observation_id: socialPostObservations.id,
                source_kind: socialPostObservations.sourceKind,
                source_channel_id: socialPostObservations.socialChannelId,
                source_account_id: socialPostObservations.researchWatchlistAccountId,
                account_name: sql<string | null>`coalesce(
                  ${socialChannels.accountName},
                  ${researchWatchlistAccounts.displayName},
                  ${researchWatchlistAccounts.handle}
                )`,
                platform: sql<string>`coalesce(${socialChannels.platform}::text, ${researchWatchlistAccounts.platform})`,
                media_type: socialPostObservations.mediaType,
                permalink: socialPostObservations.permalink,
                published_at: socialPostObservations.publishedAt,
                views: socialPostObservations.views,
                reach: socialPostObservations.reach,
                likes: socialPostObservations.likes,
                comments: socialPostObservations.comments,
                saved: socialPostObservations.saved,
                shares: socialPostObservations.shares,
                interactions: socialPostObservations.interactions,
                metrics_version: sql<string>`${RESEARCH_METRICS_VERSION}`,
                duration_seconds: socialPostObservations.durationSeconds,
                saved_at: researchBookmarks.createdAt,
              })
              .from(researchBookmarks)
              .innerJoin(
                socialPostObservations,
                eq(socialPostObservations.id, researchBookmarks.socialPostObservationId),
              )
              .leftJoin(
                socialChannels,
                eq(socialChannels.id, socialPostObservations.socialChannelId),
              )
              .leftJoin(
                researchWatchlistAccounts,
                eq(researchWatchlistAccounts.id, socialPostObservations.researchWatchlistAccountId),
              )
              .where(
                and(
                  eq(researchBookmarks.workspaceId, workspace.id),
                  or(
                    eq(socialChannels.workspaceId, workspace.id),
                    eq(researchWatchlistAccounts.workspaceId, workspace.id),
                  ),
                ),
              )
              .orderBy(desc(researchBookmarks.createdAt))
              .limit(limit)
          : [];

        const teardowns = include("teardowns")
          ? await db
              .select({
                id: researchTeardowns.id,
                collection_id: researchTeardowns.collectionId,
                source_kind: researchTeardowns.sourceKind,
                source_reference: researchTeardowns.sourceReference,
                result: researchTeardowns.result,
                created_by: researchTeardowns.createdBy,
                created_at: researchTeardowns.createdAt,
              })
              .from(researchTeardowns)
              .where(eq(researchTeardowns.workspaceId, workspace.id))
              .orderBy(desc(researchTeardowns.createdAt))
              .limit(limit)
          : [];

        const watchlist = include("watchlist")
          ? await db
              .select({
                id: researchWatchlistAccounts.id,
                platform: researchWatchlistAccounts.platform,
                handle: researchWatchlistAccounts.handle,
                display_name: researchWatchlistAccounts.displayName,
                source_url: researchWatchlistAccounts.sourceUrl,
                provider_status: researchWatchlistAccounts.providerStatus,
                provider_error_code: researchWatchlistAccounts.providerErrorCode,
                last_checked_at: researchWatchlistAccounts.lastCheckedAt,
                created_at: researchWatchlistAccounts.createdAt,
              })
              .from(researchWatchlistAccounts)
              .where(
                and(
                  eq(researchWatchlistAccounts.workspaceId, workspace.id),
                  isNull(researchWatchlistAccounts.archivedAt),
                ),
              )
              .orderBy(desc(researchWatchlistAccounts.createdAt))
              .limit(limit)
          : [];

        return result(
          {
            workspace_id: workspace.id,
            workspace: {
              name: workspace.name,
              slug: workspace.slug,
              timezone: workspace.timezone,
            },
            item_kind,
            collections,
            bookmarks,
            teardowns,
            watchlist,
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
