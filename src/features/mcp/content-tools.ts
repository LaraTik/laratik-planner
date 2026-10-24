import "server-only";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  archiveContentItem,
  assignContentOwner,
  getContentItem,
  listWorkspaceContent,
  quickCreateContentItem,
  rescheduleContentItem,
  transitionContent,
  updateContentItem,
} from "@/features/content/server";
import { duplicateContentItem } from "@/lib/planning/content-clone";
import { contentItems } from "@/lib/db/schema";
import type { McpContext, McpToolResultHelpers } from "@/features/mcp/tool-contracts";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";

type ContentToolDependencies = McpToolResultHelpers & {
  workspaceId: z.ZodString;
  contentItemId: z.ZodString;
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

export function registerContentTools(
  server: McpServer,
  context: McpContext,
  dependencies: ContentToolDependencies,
) {
  const {
    workspaceId,
    contentItemId,
    responseFormat,
    requireScope,
    requireWorkspace,
    result,
    errorResult,
    McpToolError,
  } = dependencies;

  server.registerTool(
    "laratik_planner_list_content",
    {
      title: "List planning content",
      description:
        "List non-archived content items in one accessible workspace with stable pagination and filters.",
      inputSchema: z.object({
        workspace_id: workspaceId,
        month_start: z.string().datetime().optional(),
        month_end: z.string().datetime().optional(),
        status: z.enum(CONTENT_STATUSES).optional(),
        search: z.string().max(200).optional(),
        owner_id: z.string().guid().optional(),
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
          ...(input.month_start ? { monthStart: new Date(input.month_start) } : {}),
          ...(input.month_end ? { monthEnd: new Date(input.month_end) } : {}),
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
        planned_publish_at: z.string().datetime(),
        channel_ids: z.array(z.string().guid()).max(100).optional(),
        format_payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Optional format-specific creative fields. The planner validates and normalizes this payload against the selected format.",
          ),
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
          plannedPublishAt: new Date(input.planned_publish_at),
          channelIds: input.channel_ids,
          ...(input.format_payload !== undefined ? { formatPayload: input.format_payload } : {}),
        });
        return result(
          { id, status: "draft", format_payload_written: input.format_payload !== undefined },
          input.response_format,
        );
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
        planned_publish_at: z.string().datetime(),
        channel_ids: z.array(z.string().guid()).max(100).optional(),
        format_payload: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Optional complete format-specific creative payload. It is revalidated against the item's selected format.",
          ),
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
          plannedPublishAt: new Date(input.planned_publish_at),
          channelIds: input.channel_ids,
          ...(input.format_payload !== undefined ? { formatPayload: input.format_payload } : {}),
        });
        return result(
          {
            id: input.content_item_id,
            updated: true,
            format_payload_written: input.format_payload !== undefined,
          },
          input.response_format,
        );
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
        planned_publish_at: z.string().datetime(),
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
          plannedPublishAt: new Date(planned_publish_at),
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
        owner_id: z.string().guid(),
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
        "Run one explicit workflow action through the planner state machine. Invalid transitions and role restrictions are rejected. Transitions that target a stage excluded by the workspace's active scenario are also rejected; call laratik_planner_get_workspace_settings first if the spine is unclear.",
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
        planned_publish_at: z.string().datetime().nullable().optional(),
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
          ...(planned_publish_at !== undefined
            ? { plannedPublishAt: planned_publish_at ? new Date(planned_publish_at) : null }
            : {}),
          ...(format ? { format } : {}),
        });
        return result(copy, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
