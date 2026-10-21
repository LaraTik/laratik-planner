import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import {
  agencies,
  agencyMemberships,
  researchBookmarks,
  researchCollections,
  researchTeardowns,
  researchWatchlistAccounts,
  socialChannels,
  socialPostObservations,
  users,
  workspaces,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings as workspaceSettingsTable,
} from "@/lib/db/schema";
import {
  canAccessInternalWorkspace,
  hasWorkspaceRole,
  PermissionDeniedError,
} from "@/lib/auth/policy";
import { RESEARCH_METRICS_VERSION } from "@/lib/research/metrics";
import { applyWorkflowScenario } from "@/features/content/server";
import { DomainError, WORKFLOW_SCENARIOS } from "@/lib/content/workflow";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";
import { registerDiagnosticTools } from "@/features/mcp/diagnostic-tools";
import { registerBrandKitTools } from "@/features/mcp/brand-kit-tools";
import { registerTaskTools } from "@/features/mcp/task-tools";
import { registerContentTools } from "@/features/mcp/content-tools";
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

  server.registerTool(
    "laratik_planner_list_workspaces",
    {
      title: "List accessible workspaces",
      description:
        "List active internal workspaces the authenticated user can access. Pass `name_query` (case-insensitive substring, 1-120 chars) to filter by name or slug — useful for resolving a specific workspace UUID without paging through the full list. Empty/missing filter returns every accessible workspace, capped at 200.",
      inputSchema: z.object({
        name_query: z
          .string()
          .trim()
          .min(1)
          .max(120)
          .optional()
          .describe(
            "Case-insensitive substring match against workspace.name or workspace.slug. Trimmed before matching. Returns matching workspaces only.",
          ),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ name_query, response_format }) => {
      try {
        const trimmed = name_query?.trim();
        if (trimmed && (trimmed.length < 1 || trimmed.length > 120)) {
          throw new McpToolError(
            "invalid_request",
            "name_query must be 1-120 characters after trimming.",
          );
        }
        const memberships = await db
          .select({
            agencyId: agencyMemberships.agencyId,
            isAgencyAdmin: agencyMemberships.isAgencyAdmin,
          })
          .from(agencyMemberships)
          .where(
            and(
              eq(agencyMemberships.userId, context.actor.id),
              eq(agencyMemberships.status, "active"),
            ),
          );
        const agencyIds = memberships.map((membership) => membership.agencyId);
        if (agencyIds.length === 0) return result([], response_format);
        const baseQuery = db
          .select({
            id: workspaces.id,
            agencyId: workspaces.agencyId,
            agencyName: agencies.name,
            name: workspaces.name,
            slug: workspaces.slug,
            timezone: workspaces.timezone,
          })
          .from(workspaces)
          .innerJoin(agencies, eq(agencies.id, workspaces.agencyId));
        const whereClauses = [
          eq(workspaces.status, "active"),
          isNull(agencies.archivedAt),
          isNull(agencies.suspendedAt),
        ];
        if (trimmed) {
          // Postgres ILIKE on both name + slug keeps the filter cheap and
          // forgiving for callers who type partial Arabic, mixed casing,
          // or only remember the slug. Escape any user-controlled LIKE
          // wildcards (%, _) so callers can't widen the match accidentally.
          const safe = trimmed.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
          const pattern = `%${safe}%`;
          whereClauses.push(
            sql`(${workspaces.name} ILIKE ${pattern} ESCAPE '\\' OR ${workspaces.slug} ILIKE ${pattern} ESCAPE '\\')`,
          );
        }
        const rows = await baseQuery.where(and(...whereClauses)).limit(200);
        const allowed = [];
        for (const row of rows.filter((row) => agencyIds.includes(row.agencyId))) {
          if (await canAccessInternalWorkspace(context.actor, row.id)) allowed.push(row);
        }
        return result(allowed, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  // Added 2026-09-30. Every other tool in this server resolves people to
  // bare UUIDs — `list_content` returns `contentOwnerId` / `designerId` /
  // `clientReviewerId` and `get_content` returns an `assignments` array of
  // `{ assignmentType, userId }` with no name. A caller that had to group
  // work per person (a daily ops report, a workload rollup) therefore had no
  // way to turn those ids into anything a human could read, and the only
  // options were a hand-maintained id→name map — which rots silently the
  // moment someone joins — or grouping by role only, which hides who is
  // actually carrying the work. This tool closes that gap from the
  // authoritative tables (`user` + `workspace_membership` +
  // `workspace_membership_role`) so names never have to be hardcoded.
  //
  // Read-only and gated on `content:read`, so it works with the same
  // read-only token every other read tool already accepts. It returns
  // membership-scoped people only; an agency admin's implicit access to all
  // roles in a workspace they administer is a policy fact, not a membership
  // row, so it is reported as `roles: []` rather than invented here.
  server.registerTool(
    "laratik_planner_list_workspace_members",
    {
      title: "List workspace members",
      description:
        "List the people who hold a membership in one accessible workspace, with their display name, email, workspace roles, and last activity. This is the only way to resolve the owner/designer/reviewer UUIDs returned by list_content and get_content back to names. Pass include_deactivated=true to include deactivated memberships (default: active only).",
      inputSchema: z.object({
        workspace_id: workspaceId,
        include_deactivated: z
          .boolean()
          .default(false)
          .describe("Include deactivated memberships. Default false (active only)."),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ workspace_id, include_deactivated, response_format }) => {
      try {
        requireScope(context, "content:read");
        if (!(await canAccessInternalWorkspace(context.actor, workspace_id))) {
          return errorResult(new PermissionDeniedError("list workspace members"));
        }
        const membershipClauses = [eq(workspaceMemberships.workspaceId, workspace_id)];
        if (!include_deactivated) {
          membershipClauses.push(eq(workspaceMemberships.status, "active"));
        }
        const membershipRows = await db
          .select({
            membershipId: workspaceMemberships.id,
            userId: workspaceMemberships.userId,
            status: workspaceMemberships.status,
            displayName: users.displayName,
            email: users.email,
            lastActiveAt: users.lastActiveAt,
          })
          .from(workspaceMemberships)
          .innerJoin(users, eq(users.id, workspaceMemberships.userId))
          .where(and(...membershipClauses))
          // Defensive upper bound; a workspace realistically has far fewer.
          .orderBy(asc(users.displayName))
          .limit(200);
        if (membershipRows.length === 0) return result([], response_format);

        // Roles live on a child table keyed by membership, so a second query
        // avoids a row-per-role join that would duplicate the member fields.
        const roleRows = await db
          .select({
            membershipId: workspaceMembershipRoles.workspaceMembershipId,
            role: workspaceMembershipRoles.role,
          })
          .from(workspaceMembershipRoles)
          .innerJoin(
            workspaceMemberships,
            eq(workspaceMemberships.id, workspaceMembershipRoles.workspaceMembershipId),
          )
          .where(
            and(
              eq(workspaceMemberships.workspaceId, workspace_id),
              inArray(
                workspaceMembershipRoles.workspaceMembershipId,
                membershipRows.map((row) => row.membershipId),
              ),
            ),
          )
          .limit(1000);

        const rolesByMembership = new Map<string, string[]>();
        for (const row of roleRows) {
          const bucket = rolesByMembership.get(row.membershipId);
          if (bucket) bucket.push(row.role);
          else rolesByMembership.set(row.membershipId, [row.role]);
        }

        const members = membershipRows.map((row) => ({
          userId: row.userId,
          displayName: row.displayName,
          email: row.email,
          status: row.status,
          roles: rolesByMembership.get(row.membershipId) ?? [],
          lastActiveAt: row.lastActiveAt,
        }));
        return result(members, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_list_agencies",
    {
      title: "List accessible agencies",
      description:
        "List active agencies where the authenticated user is an active member. Use the exact agency UUID from this response for agency-scoped task operations; no agency outside the token owner's memberships is returned.",
      inputSchema: z.object({ response_format: responseFormat }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      try {
        requireScope(context, "content:read");
        const rows = await db
          .select({ id: agencies.id, name: agencies.name, slug: agencies.slug })
          .from(agencies)
          .innerJoin(agencyMemberships, eq(agencyMemberships.agencyId, agencies.id))
          .where(
            and(
              eq(agencyMemberships.userId, context.actor.id),
              eq(agencyMemberships.status, "active"),
              isNull(agencies.archivedAt),
              isNull(agencies.suspendedAt),
            ),
          )
          .orderBy(asc(agencies.name))
          .limit(200);
        return result(rows, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

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

  server.registerTool(
    "laratik_planner_get_workspace_settings",
    {
      title: "Get workspace settings",
      description:
        "Read the workspace's active workflow scenario, approval mode, lead times, and monthly target. Use this to confirm which spine a workspace is running before proposing transitions.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ workspace_id, response_format }) => {
      try {
        requireScope(context, "content:read");
        if (!(await canAccessInternalWorkspace(context.actor, workspace_id))) {
          return errorResult(new PermissionDeniedError("read workspace settings"));
        }
        const { getAccessibleWorkspace } = await import("@/lib/workspaces/context");
        const workspace = await getAccessibleWorkspace(context.actor, workspace_id);
        if (!workspace) {
          return errorResult(new Error("Workspace not found"));
        }
        const [row] = await db
          .select({
            workflowScenario: workspaceSettingsTable.workflowScenario,
            approvalMode: workspaceSettingsTable.approvalMode,
            contentApprovalLeadDays: workspaceSettingsTable.contentApprovalLeadDays,
            designCompleteLeadDays: workspaceSettingsTable.designCompleteLeadDays,
            creativeApprovalLeadDays: workspaceSettingsTable.creativeApprovalLeadDays,
            readyToPublishLeadDays: workspaceSettingsTable.readyToPublishLeadDays,
            monthlyTarget: workspaceSettingsTable.monthlyTarget,
            metaPublishingEnabled: workspaceSettingsTable.metaPublishingEnabled,
          })
          .from(workspaceSettingsTable)
          .where(eq(workspaceSettingsTable.workspaceId, workspace.id))
          .limit(1);
        const scenarioId = (row?.workflowScenario ?? "standard") as
          "standard" | "lightweight" | "two_gate_client" | "self_publish";
        const catalog = WORKFLOW_SCENARIOS[scenarioId];
        const payload = {
          workspace_id: workspace.id,
          slug: workspace.slug,
          workflow_scenario: {
            id: scenarioId,
            name_key: `contentDetail.workflow.scenario.${scenarioId.replace(/_/g, "")}.name`,
            stages: catalog?.stages ?? WORKFLOW_SCENARIOS.standard.stages,
            approval_mode_forced: catalog?.approvalMode ?? null,
            publishing_setup_required: catalog?.publishingSetupRequired ?? true,
          },
          approval_mode: row?.approvalMode ?? "simple",
          lead_days: {
            content_approval: row?.contentApprovalLeadDays ?? 10,
            design_complete: row?.designCompleteLeadDays ?? 5,
            creative_approval: row?.creativeApprovalLeadDays ?? 0,
            ready_to_publish: row?.readyToPublishLeadDays ?? 3,
          },
          monthly_target: row?.monthlyTarget ?? null,
          meta_publishing_enabled: row?.metaPublishingEnabled ?? false,
        };
        return result(payload, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_apply_workflow_scenario",
    {
      title: "Apply workflow scenario",
      description:
        "Apply one of the pre-defined workflow scenarios to the workspace. Manager-only. Scenarios are reversible; in-flight items keep their current state. Side effects: may force approval_mode to match the scenario's contract.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        scenario_id: z.enum(["standard", "lightweight", "two_gate_client", "self_publish"]),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ workspace_id, scenario_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        // The scenario action now takes the explicit (agencySlug, workspaceSlug)
        // pair so the tenant comes from an identified context rather than the
        // active-agency cookie. The MCP surface resolves the same pair.
        //
        // The workspace is resolved BY ID here. It used to be resolved with
        // `getAccessibleWorkspace`, which looks a workspace up by SLUG — so
        // every call with the documented UUID failed with "Workspace not
        // found" and the tool was, in effect, gated on a lookup bug.
        const ws = await requireWorkspace(context, workspace_id);
        // Manager-only, as the tool description promises. Checked here so
        // the tool fails closed on its own contract rather than relying on
        // a downstream action to refuse.
        if (!(await hasWorkspaceRole(context.actor, ws.id, ["workspace_manager"]))) {
          throw new McpToolError("forbidden", "Workspace manager role required.");
        }
        const outcome = await applyWorkflowScenario(context.actor, ws.id, scenario_id);
        if (!outcome.ok) return errorResult(new Error(outcome.error ?? "could not apply scenario"));
        return result(
          {
            workspace_id: ws.id,
            scenario_id,
            ...(outcome.forcedApprovalMode
              ? { forced_approval_mode: outcome.forcedApprovalMode }
              : {}),
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

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
