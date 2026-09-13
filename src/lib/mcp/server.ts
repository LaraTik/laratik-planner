import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { agencies, agencyMemberships, contentItems, workspaces } from "@/lib/db/schema";
import { canAccessInternalWorkspace, PermissionDeniedError, type Actor } from "@/lib/auth/policy";
import {
  archiveContentItem,
  assignContentOwner,
  getContentItem,
  listWorkspaceContent,
  quickCreateContentItem,
  rescheduleContentItem,
  transitionContent,
  updateContentItem,
} from "@/lib/content/service";
import { duplicateContentItem } from "@/lib/planning/content-clone";
import { DomainError } from "@/lib/content/workflow";
import type { McpTokenScope } from "./tokens";
import { z } from "zod";

const CONTENT_FORMATS = [
  "static_post",
  "carousel",
  "story",
  "short_form_video",
  "long_form_video",
  "live_content",
  "article",
  "other",
] as const;

const WORKFLOW_ACTIONS = [
  "submit_content_review",
  "approve_content",
  "request_content_changes",
  "resubmit_content",
  "assign_designer",
  "submit_delivery",
  "approve_internal_creative",
  "request_creative_changes",
  "approve_client_creative",
  "record_published",
  "cancel",
  "block",
  "unblock",
] as const;
const CONTENT_STATUSES = [
  "draft",
  "content_review",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "partially_published",
  "published",
  "changes_requested",
  "blocked",
  "cancelled",
] as const;

const workspaceId = z.string().uuid().describe("Exact workspace UUID returned by list_workspaces.");
const contentItemId = z.string().uuid().describe("Exact content item UUID.");
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

type McpContext = { actor: Actor; scopes: McpTokenScope[] };

function requireScope(context: McpContext, scope: McpTokenScope) {
  const allowed =
    context.scopes.includes(scope) ||
    (scope === "content:read" && context.scopes.includes("content:write"));
  if (!allowed) {
    throw new McpToolError("scope_required", `This operation requires the ${scope} scope.`);
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

function safeItem(item: typeof contentItems.$inferSelect) {
  return {
    id: item.id,
    workspaceId: item.workspaceId,
    title: item.title,
    format: item.format,
    brief: item.brief,
    plannedPublishAt: item.plannedPublishAt,
    status: item.status,
    priority: item.priority,
    contentOwnerId: item.contentOwnerId,
    designerId: item.designerId,
    contentReviewerId: item.contentReviewerId,
    internalCreativeReviewerId: item.internalCreativeReviewerId,
    clientReviewerId: item.clientReviewerId,
    revision: item.revision,
    archivedAt: item.archivedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export function createLaraTikPlannerMcpServer(context: McpContext) {
  const server = new McpServer(
    { name: "laratik-planner", version: "1.0.0" },
    {
      instructions:
        "LaraTik Planner exposes the authenticated user's internal planning workspace. Always call list_workspaces first, use the exact workspace UUID, and prefer list_content before changing an item. Write operations are subject to the planner's existing role and workflow rules.",
    },
  );

  server.registerTool(
    "laratik_planner_list_workspaces",
    {
      title: "List accessible workspaces",
      description: "List active internal workspaces the authenticated user can access.",
      inputSchema: z.object({ response_format: responseFormat }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ response_format }) => {
      try {
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
        const rows = await db
          .select({
            id: workspaces.id,
            agencyId: workspaces.agencyId,
            agencyName: agencies.name,
            name: workspaces.name,
            slug: workspaces.slug,
            timezone: workspaces.timezone,
          })
          .from(workspaces)
          .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
          .where(
            and(
              eq(workspaces.status, "active"),
              isNull(agencies.archivedAt),
              isNull(agencies.suspendedAt),
            ),
          )
          .limit(200);
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

  server.registerTool(
    "laratik_planner_list_content",
    {
      title: "List planning content",
      description:
        "List non-archived content items in one accessible workspace with stable pagination and filters.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        month_start: z.coerce.date().optional(),
        month_end: z.coerce.date().optional(),
        status: z.enum(CONTENT_STATUSES).optional(),
        search: z.string().max(200).optional(),
        owner_id: z.string().uuid().optional(),
        format: z.enum(CONTENT_FORMATS).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).max(10000).default(0),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        await requireWorkspace(context, input.workspace_id);
        const rows = await listWorkspaceContent(context.actor, input.workspace_id, {
          ...(input.month_start ? { monthStart: input.month_start } : {}),
          ...(input.month_end ? { monthEnd: input.month_end } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.search ? { search: input.search } : {}),
          ...(input.owner_id ? { ownerId: input.owner_id } : {}),
          ...(input.format ? { format: input.format } : {}),
          limit: input.limit,
          offset: input.offset,
        });
        return result(
          {
            items: rows.map(safeItem),
            limit: input.limit,
            offset: input.offset,
            has_more: rows.length === input.limit,
          },
          input.response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_get_content",
    {
      title: "Get planning content",
      description: "Read one internal content item, its selected channels, and assignment history.",
      inputSchema: z.object({ content_item_id: contentItemId, response_format: responseFormat }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ content_item_id, response_format }) => {
      try {
        const item = await getContentItem(context.actor, content_item_id);
        if (!item) throw new McpToolError("not_found", "Content item not found.");
        return result(item, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_create_content",
    {
      title: "Create planning content",
      description:
        "Create one draft content item using the planner's Quick Create validation and default channel selection.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        title: z.string().min(2).max(200),
        format: z.enum(CONTENT_FORMATS),
        brief: z.string().max(2000).default(""),
        planned_publish_at: z.coerce.date(),
        channel_ids: z.array(z.string().uuid()).max(100).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        requireScope(context, "content:write");
        await requireWorkspace(context, input.workspace_id);
        const id = await quickCreateContentItem(context.actor, {
          workspaceId: input.workspace_id,
          title: input.title,
          format: input.format,
          brief: input.brief,
          plannedPublishAt: input.planned_publish_at,
          channelIds: input.channel_ids,
        });
        return result({ id, status: "draft" }, input.response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_update_content",
    {
      title: "Update planning content",
      description:
        "Update an editable draft or changes-requested item. Existing workflow editability rules remain enforced.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        title: z.string().min(2).max(200),
        format: z.enum(CONTENT_FORMATS),
        brief: z.string().max(2000).default(""),
        planned_publish_at: z.coerce.date(),
        channel_ids: z.array(z.string().uuid()).max(100).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      try {
        requireScope(context, "content:write");
        await updateContentItem(context.actor, {
          contentItemId: input.content_item_id,
          title: input.title,
          format: input.format,
          brief: input.brief,
          plannedPublishAt: input.planned_publish_at,
          channelIds: input.channel_ids,
        });
        return result({ id: input.content_item_id, updated: true }, input.response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_reschedule_content",
    {
      title: "Reschedule content",
      description:
        "Change only the planned publish date for an accessible item; useful when the calendar edit affordance is hard to find.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        planned_publish_at: z.coerce.date(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, planned_publish_at, response_format }) => {
      try {
        requireScope(context, "content:write");
        await rescheduleContentItem(context.actor, {
          contentItemId: content_item_id,
          plannedPublishAt: planned_publish_at,
        });
        return result({ id: content_item_id, planned_publish_at }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_change_owner",
    {
      title: "Change content owner",
      description:
        "Reassign the coordinating owner to an eligible internal workspace member without changing workflow stage.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        owner_id: z.string().uuid(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, owner_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        await assignContentOwner(context.actor, {
          contentItemId: content_item_id,
          ownerId: owner_id,
        });
        return result({ id: content_item_id, owner_id, updated: true }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_transition_content",
    {
      title: "Advance workflow item",
      description:
        "Run one explicit workflow action through the planner state machine. Invalid transitions and role restrictions are rejected.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        action: z.enum(WORKFLOW_ACTIONS),
        reason: z.string().max(2000).optional(),
        return_target: z.string().max(40).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, action, reason, return_target, response_format }) => {
      try {
        requireScope(context, "content:write");
        const transition = await transitionContent(context.actor, {
          contentItemId: content_item_id,
          action,
          ...(reason ? { reason } : {}),
          ...(return_target ? { returnTarget: return_target } : {}),
        });
        return result({ id: content_item_id, ...transition }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_archive_content",
    {
      title: "Archive content",
      description:
        "Soft-archive one content item. This requires an explicit confirm=true and cannot be undone through this MCP surface.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        confirm: z.literal(true),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        const item = await getContentItem(context.actor, content_item_id);
        if (!item) throw new McpToolError("not_found", "Content item not found.");
        await archiveContentItem(context.actor, {
          workspaceId: item.workspaceId,
          contentItemId: content_item_id,
        });
        return result({ id: content_item_id, archived: true }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_duplicate_content",
    {
      title: "Duplicate content",
      description:
        "Create a new draft copy of an existing content item, optionally with a new publish date or format.",
      inputSchema: z.object({
        content_item_id: contentItemId,
        planned_publish_at: z.coerce.date().nullable().optional(),
        format: z.enum(CONTENT_FORMATS).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({ content_item_id, planned_publish_at, format, response_format }) => {
      try {
        requireScope(context, "content:write");
        const copy = await duplicateContentItem(context.actor, content_item_id, {
          ...(planned_publish_at !== undefined ? { plannedPublishAt: planned_publish_at } : {}),
          ...(format ? { format } : {}),
        });
        return result(copy, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  return server;
}
