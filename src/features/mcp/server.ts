import "server-only";

import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import {
  researchBookmarks,
  researchCollections,
  researchTeardowns,
  researchWatchlistAccounts,
  socialChannels,
  socialPostObservations,
  workspaces,
} from "@/lib/db/schema";
import { canAccessInternalWorkspace, PermissionDeniedError } from "@/lib/auth/policy";
import { RESEARCH_METRICS_VERSION } from "@/lib/research/metrics";
import { DomainError } from "@/lib/content/workflow";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";
import { registerDiagnosticTools } from "@/features/mcp/diagnostic-tools";
import { registerBrandKitTools } from "@/features/mcp/brand-kit-tools";
import { registerTaskTools } from "@/features/mcp/task-tools";
import { registerContentTools } from "@/features/mcp/content-tools";
import {
  registerWorkspaceDirectoryTools,
  registerWorkspaceWorkflowTools,
} from "@/features/mcp/workspace-tools";
import type { McpContext } from "@/features/mcp/tool-contracts";

const workspaceId = z.string().uuid().describe("Exact workspace UUID returned by list_workspaces.");
const contentItemId = z.string().uuid().describe("Exact content item UUID.");
const agencyId = z.string().uuid().describe("Exact agency UUID returned by list_agencies.");
const taskId = z.string().uuid().describe("Exact agency task UUID.");
const responseFormat = z.enum(["json", "markdown"]).default("json");

export class McpToolError extends Error {
  constructor(
    public readonly code: "not_found" | "forbidden" | "invalid_request" | "scope_required",
    message: string,
  ) {
    super(message);
    this.name = "McpToolError";
  }
}

function requireScope(context: McpContext, scope: McpTokenScope) {
  const allowed =
    context.scopes.includes(scope) ||
    (scope === "content:read" && context.scopes.includes("content:write"));
  if (!allowed) {
    throw new McpToolError("scope_required", `This operation requires the ${scope} scope.`);
  }
}

/**
 * Two-gate authorization for the error-diagnostics tools.
 *
 * The scope alone is **not** sufficient, and that is the whole point of
 * this helper. `app_error_event` holds routes, scrubbed messages, stacks,
 * and actor ids from *every* tenant, so a token scoped
 * `platform:diagnostics:read` but held by an ordinary workspace member
 * would otherwise be able to read another agency's failures. Every
 * diagnostics tool therefore requires the scope **and** the
 * `platform.console.read` platform permission — the same gate the
 * `/app/platform/errors` console page uses.
 *
 * Note the asymmetry with `requireScope`: `content:write` implies
 * `content:read`, and `platform:diagnostics:write` implies
 * `platform:diagnostics:read`, but nothing crosses between the `content`
 * and `platform:diagnostics` domains in either direction. They are
 * unrelated privilege domains and must not be conflated.
 */
async function requireDiagnosticsAccess(
  context: McpContext,
  scope: "platform:diagnostics:read" | "platform:diagnostics:write",
) {
  if (scope === "platform:diagnostics:read") {
    const allowed =
      context.scopes.includes("platform:diagnostics:read") ||
      context.scopes.includes("platform:diagnostics:write");
    if (!allowed) {
      throw new McpToolError(
        "scope_required",
        "This operation requires the platform:diagnostics:read scope.",
      );
    }
  } else {
    requireScope(context, scope);
  }
  const { hasPlatformPermission } = await import("@/lib/auth/platform-access");
  if (!(await hasPlatformPermission(context.actor, "platform.console.read"))) {
    throw new PermissionDeniedError("platform.console.read");
  }
}

async function requireWorkspace(context: McpContext, id: string) {
  const [workspace] = await db
    .select({
      id: workspaces.id,
      agencyId: workspaces.agencyId,
      name: workspaces.name,
      slug: workspaces.slug,
      timezone: workspaces.timezone,
      status: workspaces.status,
    })
    .from(workspaces)
    .where(eq(workspaces.id, id))
    .limit(1);
  if (!workspace || workspace.status !== "active") {
    throw new McpToolError("not_found", "Workspace not found.");
  }
  if (!(await canAccessInternalWorkspace(context.actor, workspace.id))) {
    throw new McpToolError("not_found", "Workspace not found.");
  }
  return workspace;
}

function serialise<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function markdown(value: unknown): string {
  if (Array.isArray(value)) {
    return value.length === 0
      ? "No results."
      : value.map((row) => `- ${JSON.stringify(row)}`).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([key, item]) => `- **${key}**: ${typeof item === "string" ? item : JSON.stringify(item)}`,
      )
      .join("\n");
  }
  return String(value ?? "");
}

function result(value: unknown, format: "json" | "markdown") {
  const serialised = serialise(value);
  return {
    content: [
      {
        type: "text" as const,
        text: format === "markdown" ? markdown(serialised) : JSON.stringify(serialised),
      },
    ],
    structuredContent: { result: serialised },
  };
}

function errorResult(error: unknown) {
  const message =
    error instanceof McpToolError || error instanceof DomainError
      ? error.message
      : error instanceof PermissionDeniedError
        ? "You do not have permission to perform this operation."
        : "The planner could not complete this operation.";
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

// ─── Brand-kit helpers (M5.5) ───────────────────────────────────────────────
//
export function createLaraTikPlannerMcpServer(context: McpContext) {
  const server = new McpServer(
    { name: "laratik-planner", version: "1.0.0" },
    {
      instructions:
        "LaraTik Planner exposes the authenticated user's internal planning workspace and agency task list. Call list_agencies before agency-scoped task operations, call list_workspaces before workspace-scoped operations, and prefer read tools before changing data. Write operations are subject to the planner's existing agency, workspace, role, and workflow rules.",
    },
  );

  const workspaceToolDependencies = {
    workspaceId,
    responseFormat,
    requireScope,
    requireWorkspace,
    result,
    errorResult,
    McpToolError,
  };

  registerWorkspaceDirectoryTools(server, context, workspaceToolDependencies);

  registerTaskTools(server, context, {
    agencyId,
    taskId,
    responseFormat,
    requireScope,
    result,
    errorResult,
    McpToolError,
  });

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

  registerWorkspaceWorkflowTools(server, context, workspaceToolDependencies);

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

  registerContentTools(server, context, {
    workspaceId,
    contentItemId,
    responseFormat,
    requireScope,
    requireWorkspace,
    result,
    errorResult,
    McpToolError,
  });

  registerBrandKitTools(server, context, {
    workspaceId,
    responseFormat,
    requireWorkspace,
    requireScope,
    result,
    errorResult,
    McpToolError,
  });

  registerDiagnosticTools(server, context, {
    responseFormat,
    requireDiagnosticsAccess,
    result,
    errorResult,
    McpToolError,
  });

  return server;
}
