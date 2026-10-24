import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import {
  agencies,
  agencyMemberships,
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
import { applyWorkflowScenario } from "@/features/content/server";
import { WORKFLOW_SCENARIOS } from "@/lib/content/workflow";
import type { McpContext, McpToolResultHelpers } from "@/features/mcp/tool-contracts";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";

type WorkspaceToolDependencies = McpToolResultHelpers & {
  workspaceId: z.ZodString;
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

export function registerWorkspaceDirectoryTools(
  server: McpServer,
  context: McpContext,
  dependencies: WorkspaceToolDependencies,
) {
  const { workspaceId, responseFormat, requireScope, result, errorResult, McpToolError } =
    dependencies;

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
}

export function registerWorkspaceWorkflowTools(
  server: McpServer,
  context: McpContext,
  dependencies: WorkspaceToolDependencies,
) {
  const {
    workspaceId,
    responseFormat,
    requireScope,
    requireWorkspace,
    result,
    errorResult,
    McpToolError,
  } = dependencies;

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
}
