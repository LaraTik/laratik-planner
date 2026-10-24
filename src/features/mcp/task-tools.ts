import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { agencies, agencyMemberships } from "@/lib/db/schema";
import {
  completeTaskAttachment,
  createTaskAttachmentIntent,
  createTaskAttachmentLink,
  listTaskAttachmentUrls,
} from "@/lib/tasks/attachments";
import {
  archiveTask,
  createTask,
  getTaskDetail,
  listTasks,
  restoreTask,
  TASK_PRIORITIES,
  TASK_STATUSES,
  updateTask,
} from "@/lib/tasks/service";
import type { McpContext, McpToolResultHelpers } from "@/features/mcp/tool-contracts";
import type { McpTokenScope } from "@/lib/mcp/tokens";
import { z } from "zod";

type TaskToolDependencies = McpToolResultHelpers & {
  agencyId: z.ZodString;
  taskId: z.ZodString;
  requireScope: (context: McpContext, scope: McpTokenScope) => void;
};

export function registerTaskTools(
  server: McpServer,
  context: McpContext,
  dependencies: TaskToolDependencies,
) {
  const { agencyId, taskId, responseFormat, requireScope, result, errorResult, McpToolError } =
    dependencies;

  async function requireAgency(context: McpContext, id: string) {
    const [agency] = await db
      .select({
        id: agencies.id,
        name: agencies.name,
        slug: agencies.slug,
      })
      .from(agencies)
      .innerJoin(agencyMemberships, eq(agencyMemberships.agencyId, agencies.id))
      .where(
        and(
          eq(agencies.id, id),
          eq(agencyMemberships.userId, context.actor.id),
          eq(agencyMemberships.status, "active"),
          isNull(agencies.archivedAt),
          isNull(agencies.suspendedAt),
        ),
      )
      .limit(1);
    if (!agency) throw new McpToolError("not_found", "Agency not found.");
    return agency;
  }

  function safeTaskAttachment(attachment: {
    id: string;
    taskId: string;
    originalName: string;
    mimeType: string;
    byteSize: number;
    status: string;
    uploadedBy: string;
    createdAt: Date;
    // `null` is a real state, not a type error: an attachment whose storage
    // provider cannot sign a read URL still exists and is still reported, it
    // simply has no link. The `url` key is then omitted rather than emitted
    // as null, so MCP clients never receive a half-formed link.
    url?: string | null | undefined;
  }) {
    return {
      id: attachment.id,
      task_id: attachment.taskId,
      original_name: attachment.originalName,
      mime_type: attachment.mimeType,
      byte_size: attachment.byteSize,
      status: attachment.status,
      uploaded_by: attachment.uploadedBy,
      created_at: attachment.createdAt,
      ...(attachment.url ? { url: attachment.url } : {}),
    };
  }

  async function getMcpTaskDetail(context: McpContext, id: string) {
    const task = await getTaskDetail(context.actor, id);
    const attachments = await listTaskAttachmentUrls(context.actor, id);
    return {
      ...task,
      attachments: attachments.map(safeTaskAttachment),
    };
  }

  server.registerTool(
    "laratik_planner_list_tasks",
    {
      title: "List agency tasks",
      description:
        "List active agency tasks with pagination and server-side filters. Every active agency member may view tasks in their agency; archived tasks are excluded.",
      inputSchema: z.object({
        agency_id: agencyId,
        page: z.number().int().min(1).max(10000).default(1),
        page_size: z.number().int().min(1).max(100).default(20),
        search: z.string().trim().max(160).optional(),
        status: z.enum(TASK_STATUSES).optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        workspace_id: z.string().guid().optional(),
        assignee_id: z.string().guid().optional(),
        mine: z.boolean().default(false),
        overdue: z.boolean().default(false),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      try {
        requireScope(context, "content:read");
        await requireAgency(context, input.agency_id);
        const page = await listTasks(context.actor, {
          agencyId: input.agency_id,
          page: input.page,
          pageSize: input.page_size,
          ...(input.search ? { search: input.search } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.priority ? { priority: input.priority } : {}),
          ...(input.workspace_id ? { workspaceId: input.workspace_id } : {}),
          ...(input.assignee_id ? { assigneeId: input.assignee_id } : {}),
          ...(input.mine ? { mine: true } : {}),
          ...(input.overdue ? { overdue: true } : {}),
        });
        return result(
          {
            tasks: page.rows,
            total: page.total,
            page: page.page,
            page_size: page.pageSize,
          },
          input.response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_get_task",
    {
      title: "Get an agency task",
      description:
        "Read one task, its append-only activity history, and ready attachments. Attachment object keys and storage buckets are never exposed; ready files are represented by short-lived signed URLs.",
      inputSchema: z.object({ task_id: taskId, response_format: responseFormat }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ task_id, response_format }) => {
      try {
        requireScope(context, "content:read");
        return result(await getMcpTaskDetail(context, task_id), response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_create_task",
    {
      title: "Create an agency task",
      description:
        "Create an agency task, optionally linked to a workspace and assigned to an active agency member. Creation records the task activity event through the existing task service.",
      inputSchema: z.object({
        agency_id: agencyId,
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().max(10000).optional(),
        workspace_id: z.string().guid().nullable().optional(),
        assignee_id: z.string().guid().nullable().optional(),
        due_at: z.string().datetime().nullable().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        requireScope(context, "content:write");
        await requireAgency(context, input.agency_id);
        const task = await createTask(context.actor, {
          agencyId: input.agency_id,
          title: input.title,
          description: input.description,
          workspaceId: input.workspace_id,
          assigneeId: input.assignee_id,
          dueAt: input.due_at == null ? input.due_at : new Date(input.due_at),
          priority: input.priority,
        });
        return result({ task }, input.response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_update_task",
    {
      title: "Update an agency task",
      description:
        "Edit task content, assignment, due date, priority, or lifecycle status. The existing task service enforces creator/assignee/admin permissions, assignment restrictions, and valid status transitions.",
      inputSchema: z.object({
        task_id: taskId,
        title: z.string().trim().min(1).max(200).optional(),
        description: z.string().trim().max(10000).optional(),
        workspace_id: z.string().guid().nullable().optional(),
        assignee_id: z.string().guid().nullable().optional(),
        due_at: z.string().datetime().nullable().optional(),
        priority: z.enum(TASK_PRIORITIES).optional(),
        status: z.enum(TASK_STATUSES).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async (input) => {
      try {
        requireScope(context, "content:write");
        const task = await updateTask(context.actor, input.task_id, {
          title: input.title,
          description: input.description,
          workspaceId: input.workspace_id,
          assigneeId: input.assignee_id,
          dueAt: input.due_at == null ? input.due_at : new Date(input.due_at),
          priority: input.priority,
          status: input.status,
        });
        return result({ task }, input.response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_archive_task",
    {
      title: "Archive an agency task",
      description:
        "Soft-archive one task. This requires confirm=true and the existing task service's agency-admin permission; use restore_task to reverse the archive.",
      inputSchema: z.object({
        task_id: taskId,
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
    async ({ task_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        const task = await archiveTask(context.actor, task_id);
        return result({ task }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_restore_task",
    {
      title: "Restore an agency task",
      description:
        "Restore one soft-archived task. The existing task service requires agency-admin permission and records the restore activity event.",
      inputSchema: z.object({ task_id: taskId, response_format: responseFormat }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ task_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        const task = await restoreTask(context.actor, task_id);
        return result({ task }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_list_task_attachments",
    {
      title: "List task attachments",
      description:
        "List ready attachments on a task. File attachments receive short-lived signed read URLs; storage buckets and object keys are omitted.",
      inputSchema: z.object({ task_id: taskId, response_format: responseFormat }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ task_id, response_format }) => {
      try {
        requireScope(context, "content:read");
        const attachments = await listTaskAttachmentUrls(context.actor, task_id);
        return result(attachments.map(safeTaskAttachment), response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_create_task_attachment_intent",
    {
      title: "Create a task attachment upload intent",
      description:
        "Authorize a direct upload for a task attachment. The client must PUT the exact bytes to the returned short-lived upload URL, then call complete_task_attachment. Supported file types and the 50 MB limit are enforced by the existing storage service.",
      inputSchema: z.object({
        task_id: taskId,
        original_name: z.string().trim().min(1).max(255),
        content_type: z.string().trim().min(1).max(160),
        byte_size: z
          .number()
          .int()
          .min(1)
          .max(50 * 1024 * 1024),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ task_id, original_name, content_type, byte_size, response_format }) => {
      try {
        requireScope(context, "content:write");
        const intent = await createTaskAttachmentIntent(context.actor, task_id, {
          originalName: original_name,
          contentType: content_type,
          byteSize: byte_size,
        });
        return result(
          {
            attachment_id: intent.attachmentId,
            upload_url: intent.uploadUrl,
            expires_at: intent.expiresAt,
            ...(intent.requiredHeaders ? { required_headers: intent.requiredHeaders } : {}),
          },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_complete_task_attachment",
    {
      title: "Complete a task attachment upload",
      description:
        "Verify that an uploaded task attachment has the exact expected size and MIME type, then mark it ready. The existing storage service rejects mismatches and failed verification.",
      inputSchema: z.object({
        task_id: taskId,
        attachment_id: z.string().guid(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ task_id, attachment_id, response_format }) => {
      try {
        requireScope(context, "content:write");
        await completeTaskAttachment(context.actor, task_id, attachment_id);
        const attachments = await listTaskAttachmentUrls(context.actor, task_id);
        const attachment = attachments.find((item) => item.id === attachment_id);
        if (!attachment) throw new McpToolError("not_found", "Attachment not found.");
        return result({ attachment: safeTaskAttachment(attachment) }, response_format);
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "laratik_planner_link_task_attachment",
    {
      title: "Link an external resource to a task",
      description:
        "Attach an HTTPS resource to a task without downloading it into Planner. The existing task service stores the link as a ready attachment and derives a safe display name when one is not supplied.",
      inputSchema: z.object({
        task_id: taskId,
        url: z
          .string()
          .trim()
          .url()
          .refine((value) => value.startsWith("https://"), {
            message: "Task attachment URLs must use HTTPS.",
          }),
        original_name: z.string().trim().max(255).optional(),
        response_format: responseFormat,
      }),
      outputSchema: z.object({ result: z.unknown() }),
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    async ({ task_id, url, original_name, response_format }) => {
      try {
        requireScope(context, "content:write");
        const attachment = await createTaskAttachmentLink(context.actor, task_id, {
          url,
          ...(original_name !== undefined ? { originalName: original_name } : {}),
        });
        const attachments = await listTaskAttachmentUrls(context.actor, task_id);
        const linked = attachments.find((item) => item.id === attachment.id);
        return result(
          { attachment: safeTaskAttachment(linked ?? { ...attachment, url }) },
          response_format,
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
