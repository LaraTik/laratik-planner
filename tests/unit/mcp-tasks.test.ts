import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const dbMock = vi.hoisted(() => ({ db: { select: vi.fn() } }));
const policyMock = vi.hoisted(() => ({
  canAccessInternalWorkspace: vi.fn(),
}));
const taskMock = vi.hoisted(() => ({
  TASK_PRIORITIES: ["low", "normal", "high", "urgent"] as const,
  TASK_STATUSES: ["backlog", "in_progress", "blocked", "in_review", "done", "cancelled"] as const,
  archiveTask: vi.fn(),
  createTask: vi.fn(),
  getTaskDetail: vi.fn(),
  listTasks: vi.fn(),
  restoreTask: vi.fn(),
  updateTask: vi.fn(),
}));
const attachmentMock = vi.hoisted(() => ({
  completeTaskAttachment: vi.fn(),
  createTaskAttachmentIntent: vi.fn(),
  createTaskAttachmentLink: vi.fn(),
  listTaskAttachmentUrls: vi.fn(),
}));

vi.mock("@/lib/db", () => dbMock);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/policy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/policy")>()),
  canAccessInternalWorkspace: policyMock.canAccessInternalWorkspace,
}));
vi.mock("@/lib/tasks/service", () => taskMock);
vi.mock("@/lib/tasks/attachments", () => attachmentMock);

import { createLaraTikPlannerMcpServer } from "@/lib/mcp/server";
import type { McpTokenScope } from "@/lib/mcp/tokens";

const ACTOR = { id: "00000000-0000-0000-0000-0000000000aa" };
const AGENCY_ID = "00000000-0000-0000-0000-0000000000bb";
const TASK_ID = "00000000-0000-0000-0000-0000000000cc";
const ATTACHMENT_ID = "00000000-0000-0000-0000-0000000000dd";
const CREATED_AT = new Date("2026-10-07T10:00:00.000Z");

function chain(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"])
    q[method] = vi.fn(() => q);
  q.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return q;
}

async function connect(scopes: McpTokenScope[]) {
  const server = createLaraTikPlannerMcpServer({ actor: ACTOR, scopes });
  const client = new Client({ name: "mcp-task-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; text: string; structured?: unknown }> {
  const result = (await client.callTool({ name, arguments: args })) as {
    isError?: boolean;
    content?: Array<{ type: string; text: string }>;
    structuredContent?: unknown;
  };
  return {
    isError: result.isError === true,
    text: result.content?.[0]?.text ?? "",
    structured: result.structuredContent,
  };
}

const AGENCY = { id: AGENCY_ID, name: "LaraTik", slug: "laratik" };
const TASK = {
  id: TASK_ID,
  agencyId: AGENCY_ID,
  workspaceId: null,
  title: "Investigate monetisation",
  description: "Review Meta policies.",
  status: "backlog",
  priority: "normal",
  assigneeId: null,
  dueAt: null,
  startedAt: null,
  completedAt: null,
  archivedAt: null,
  archivedBy: null,
  createdBy: ACTOR.id,
  createdAt: CREATED_AT,
  updatedAt: CREATED_AT,
};

const ATTACHMENT = {
  id: ATTACHMENT_ID,
  taskId: TASK_ID,
  originalName: "policy.pdf",
  mimeType: "application/pdf",
  byteSize: 42,
  status: "ready",
  uploadedBy: ACTOR.id,
  createdAt: CREATED_AT,
  url: "https://storage.example.test/signed/policy.pdf",
};

beforeEach(() => {
  vi.clearAllMocks();
  dbMock.db.select.mockReturnValue(chain([AGENCY]));
  policyMock.canAccessInternalWorkspace.mockResolvedValue(true);
  taskMock.createTask.mockResolvedValue(TASK);
  taskMock.listTasks.mockResolvedValue({ rows: [TASK], total: 1, page: 1, pageSize: 20 });
  taskMock.getTaskDetail.mockResolvedValue({ ...TASK, events: [], attachments: [] });
  taskMock.updateTask.mockResolvedValue({ ...TASK, title: "Updated" });
  taskMock.archiveTask.mockResolvedValue({ ...TASK, archivedAt: CREATED_AT });
  taskMock.restoreTask.mockResolvedValue(TASK);
  attachmentMock.listTaskAttachmentUrls.mockResolvedValue([ATTACHMENT]);
  attachmentMock.createTaskAttachmentIntent.mockResolvedValue({
    attachmentId: ATTACHMENT_ID,
    uploadUrl: "https://storage.example.test/upload/policy.pdf",
    expiresAt: new Date("2026-10-07T10:05:00.000Z"),
    requiredHeaders: { "content-type": "application/pdf" },
  });
  attachmentMock.completeTaskAttachment.mockResolvedValue(ATTACHMENT);
  attachmentMock.createTaskAttachmentLink.mockResolvedValue({
    ...ATTACHMENT,
    externalUrl: ATTACHMENT.url,
  });
});

describe("agency task MCP tools", () => {
  it("registers the complete task surface with safe annotations", async () => {
    const client = await connect(["content:write"]);
    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "laratik_planner_list_agencies",
        "laratik_planner_list_tasks",
        "laratik_planner_get_task",
        "laratik_planner_create_task",
        "laratik_planner_update_task",
        "laratik_planner_archive_task",
        "laratik_planner_restore_task",
        "laratik_planner_list_task_attachments",
        "laratik_planner_create_task_attachment_intent",
        "laratik_planner_complete_task_attachment",
        "laratik_planner_link_task_attachment",
      ]),
    );
    expect(
      tools.find((tool) => tool.name === "laratik_planner_list_tasks")?.annotations?.readOnlyHint,
    ).toBe(true);
    expect(
      tools.find((tool) => tool.name === "laratik_planner_archive_task")?.annotations
        ?.destructiveHint,
    ).toBe(true);
  });

  it("requires content:write before invoking task mutations", async () => {
    const client = await connect(["content:read"]);
    const output = await call(client, "laratik_planner_create_task", {
      agency_id: AGENCY_ID,
      title: "Should be refused",
    });
    expect(output.isError).toBe(true);
    expect(output.text).toContain("content:write");
    expect(taskMock.createTask).not.toHaveBeenCalled();
  });

  it("creates and lists tasks through the existing agency-scoped services", async () => {
    const client = await connect(["content:write"]);
    const created = await call(client, "laratik_planner_create_task", {
      agency_id: AGENCY_ID,
      title: "Investigate monetisation",
      description: "Review Meta policies.",
      priority: "high",
    });
    expect(created.isError).toBe(false);
    expect(taskMock.createTask).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({
        agencyId: AGENCY_ID,
        title: "Investigate monetisation",
        priority: "high",
      }),
    );

    const listed = await call(client, "laratik_planner_list_tasks", {
      agency_id: AGENCY_ID,
      status: "backlog",
      page_size: 20,
    });
    expect(listed.isError).toBe(false);
    expect((listed.structured as { result: { tasks: unknown[] } }).result.tasks).toHaveLength(1);
    expect(taskMock.listTasks).toHaveBeenCalledWith(
      ACTOR,
      expect.objectContaining({ agencyId: AGENCY_ID, status: "backlog", pageSize: 20 }),
    );
  });

  it("returns task detail and attachments without leaking storage internals", async () => {
    taskMock.getTaskDetail.mockResolvedValue({
      ...TASK,
      events: [],
      attachments: [{ ...ATTACHMENT, bucket: "private", objectKey: "secret/path" }],
    });
    const client = await connect(["content:read"]);
    const output = await call(client, "laratik_planner_get_task", { task_id: TASK_ID });
    expect(output.isError).toBe(false);
    const detail = (output.structured as { result: Record<string, unknown> }).result;
    expect(detail.attachments).toEqual([
      expect.objectContaining({ id: ATTACHMENT_ID, url: ATTACHMENT.url }),
    ]);
    expect(JSON.stringify(detail)).not.toContain("secret/path");
    expect(JSON.stringify(detail)).not.toContain("private");
  });

  it("requires explicit confirmation for task archiving", async () => {
    const client = await connect(["content:write"]);
    const output = await call(client, "laratik_planner_archive_task", { task_id: TASK_ID });
    expect(output.isError).toBe(true);
    expect(taskMock.archiveTask).not.toHaveBeenCalled();
  });

  it("updates, restores, and lists attachments through the task services", async () => {
    const client = await connect(["content:write"]);
    const updated = await call(client, "laratik_planner_update_task", {
      task_id: TASK_ID,
      title: "Updated task",
      status: "in_progress",
    });
    expect(updated.isError).toBe(false);
    expect(taskMock.updateTask).toHaveBeenCalledWith(
      ACTOR,
      TASK_ID,
      expect.objectContaining({ title: "Updated task", status: "in_progress" }),
    );

    const restored = await call(client, "laratik_planner_restore_task", { task_id: TASK_ID });
    expect(restored.isError).toBe(false);
    expect(taskMock.restoreTask).toHaveBeenCalledWith(ACTOR, TASK_ID);

    const attachments = await call(client, "laratik_planner_list_task_attachments", {
      task_id: TASK_ID,
    });
    expect(attachments.isError).toBe(false);
    expect(attachments.structured).toEqual({
      result: [expect.objectContaining({ id: ATTACHMENT_ID, url: ATTACHMENT.url })],
    });
  });

  it("supports signed uploads, completion, and HTTPS links", async () => {
    const client = await connect(["content:write"]);
    const intent = await call(client, "laratik_planner_create_task_attachment_intent", {
      task_id: TASK_ID,
      original_name: "policy.pdf",
      content_type: "application/pdf",
      byte_size: 42,
    });
    expect(intent.isError).toBe(false);
    expect(intent.structured).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({ attachment_id: ATTACHMENT_ID }),
      }),
    );

    const completed = await call(client, "laratik_planner_complete_task_attachment", {
      task_id: TASK_ID,
      attachment_id: ATTACHMENT_ID,
    });
    expect(completed.isError).toBe(false);
    expect(attachmentMock.completeTaskAttachment).toHaveBeenCalledWith(
      ACTOR,
      TASK_ID,
      ATTACHMENT_ID,
    );

    const linked = await call(client, "laratik_planner_link_task_attachment", {
      task_id: TASK_ID,
      url: "https://example.com/reference",
    });
    expect(linked.isError).toBe(false);
    expect(attachmentMock.createTaskAttachmentLink).toHaveBeenCalledWith(
      ACTOR,
      TASK_ID,
      expect.objectContaining({ url: "https://example.com/reference" }),
    );

    const rejected = await call(client, "laratik_planner_link_task_attachment", {
      task_id: TASK_ID,
      url: "http://example.com/reference",
    });
    expect(rejected.isError).toBe(true);
    expect(attachmentMock.createTaskAttachmentLink).toHaveBeenCalledTimes(1);
  });
});
