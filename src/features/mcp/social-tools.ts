import "server-only";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { canAccessInternalWorkspace, PermissionDeniedError } from "@/lib/auth/policy";
import type { McpContext, McpToolResultHelpers } from "@/features/mcp/tool-contracts";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";

type SocialToolDependencies = McpToolResultHelpers & {
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

export function registerSocialAnalyticsTools(
  server: McpServer,
  context: McpContext,
  dependencies: SocialToolDependencies,
) {
  const { workspaceId, responseFormat, requireScope, requireWorkspace, result, errorResult } =
    dependencies;

  server.registerTool(
    "laratik_planner_get_command_center",
    {
      title: "Get the workspace Command Center",
      description:
        "Read the Command Center exactly as the Overview page renders it: data health per connected account, the follower/reach/views/engagement KPIs and their window, the follower trend series, channel performance, Top content, the Observed content inventory, the best-time-to-post heatmap, and video-length bands. Use this when a reported number on the Overview looks wrong — it returns the same rows the UI used, plus observationStats (rows vs distinctPosts, and how many rows are missing a thumbnail or caption), so a duplicate or missing-media problem is visible without reading the DOM.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        analysis_window: z.union([z.literal(30), z.literal(90)]).default(30),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ workspace_id, analysis_window, response_format }) => {
      try {
        requireScope(context, "content:read");
        const { getCommandCenterSnapshot } = await import("@/lib/social/command-center-snapshot");
        const workspace = await requireWorkspace(context, workspace_id);
        const { summary, observationStats } = await getCommandCenterSnapshot(
          db,
          workspace.id,
          workspace.timezone,
          new Date(),
          analysis_window,
        );
        const payload = {
          workspace: { id: workspace.id, slug: workspace.slug, timezone: workspace.timezone },
          analysis_window,
          channels: {
            connected: summary.channelCount,
            with_data: summary.channelsWithData,
            last_synced_at: summary.lastSyncedAt,
          },
          account_health: summary.accountHealth,
          health_counts: summary.health,
          kpis: {
            followers: summary.currentFollowers,
            reach: summary.currentReach,
            views: summary.currentViews,
            interactions: summary.currentInteractions,
            engagement_rate: summary.engagementRate.percent,
            follower_growth: summary.followerGrowth,
          },
          trend: summary.trend.map((point) => ({
            date: point.metricDate,
            followers: point.followerCount,
            reach: point.reach,
            views: point.views,
          })),
          channel_performance: summary.channelPerformance,
          strongest_accounts: summary.leaders,
          top_content: summary.content.topPosts,
          observed_content: summary.content.posts,
          best_time_to_post: {
            best: summary.content.bestTime,
            average_views: summary.content.averageViews,
            slots: summary.content.timeSlots,
            sample_size: summary.content.timeSlots.reduce(
              (total, slot) => total + slot.sampleSize,
              0,
            ),
          },
          video_length_bands: summary.content.lengthBands,
          observation_stats: observationStats,
        };
        return result(payload, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_backfill_thumbnails",
    {
      title: "Backfill missing post thumbnails",
      description:
        "Re-fetch preview images for observed posts that have none. Scoped deliberately: only posts whose thumbnail_url is null are considered, work is per DISTINCT post rather than per observation row, the run is bounded by limit, and a post that already has an image is never re-fetched or overwritten. Call laratik_planner_get_command_center first to read observation_stats.missing_thumbnails and see how large the backlog is.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        limit: z.number().int().min(1).max(100).default(25),
        dry_run: z
          .boolean()
          .default(true)
          .describe(
            "Report how many posts would be considered without calling the provider. Set false to actually write.",
          ),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, openWorldHint: true },
    },
    async ({ workspace_id, limit, dry_run, response_format }) => {
      try {
        requireScope(context, "content:write");
        const workspace = await requireWorkspace(context, workspace_id);
        if (!(await canAccessInternalWorkspace(context.actor, workspace_id))) {
          return errorResult(new PermissionDeniedError("backfill post thumbnails"));
        }
        const { backfillWorkspaceThumbnails, reportMissingThumbnails } =
          await import("@/lib/social/thumbnail-backfill-service");
        if (dry_run) {
          const backlog = await reportMissingThumbnails(db, workspace.id);
          return result(
            {
              workspace_id: workspace.id,
              dry_run: true,
              posts_missing_thumbnails: backlog,
              limit,
              note: "No provider calls were made. Re-run with dry_run=false to write.",
            },
            response_format,
          );
        }
        const report = await backfillWorkspaceThumbnails(db, workspace.id, { limit });
        return result(
          {
            workspace_id: workspace.id,
            dry_run: false,
            candidates: report.candidates,
            updated: report.updated,
            still_missing: report.stillMissing,
            failed: report.failed,
            skipped: report.skipped,
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
