import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const dbMock = vi.hoisted(() => ({ db: { select: vi.fn() } }));
const policyMock = vi.hoisted(() => ({ canAccessInternalWorkspace: vi.fn() }));

vi.mock("@/lib/db", () => dbMock);
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/policy", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/policy")>()),
  canAccessInternalWorkspace: policyMock.canAccessInternalWorkspace,
}));

import { createLaraTikPlannerMcpServer } from "@/lib/mcp/server";
import type { McpTokenScope } from "@/lib/mcp/tokens";

const ACTOR = { id: "00000000-0000-0000-0000-0000000000aa" };
const WORKSPACE_ID = "00000000-0000-0000-0000-0000000000bb";

function chain(rows: unknown[]) {
  const query: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    query[method] = vi.fn(() => query);
  }
  query.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return query;
}

async function connect(scopes: McpTokenScope[]) {
  const server = createLaraTikPlannerMcpServer({ actor: ACTOR, scopes });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function call(client: Client, arguments_: Record<string, unknown> = {}) {
  return (await client.callTool({
    name: "laratik_planner_list_research",
    arguments: arguments_,
  })) as {
    isError?: boolean;
    content?: Array<{ type: string; text: string }>;
    structuredContent?: { result?: unknown };
  };
}

const WORKSPACE = {
  id: WORKSPACE_ID,
  agencyId: "00000000-0000-0000-0000-0000000000cc",
  name: "Acme Workspace",
  slug: "acme",
  timezone: "Europe/Berlin",
  status: "active",
};

const WATCHLIST = [
  {
    id: "00000000-0000-0000-0000-0000000000dd",
    platform: "instagram",
    handle: "example_brand",
    display_name: "Example Brand",
    source_url: "https://instagram.com/example_brand",
    provider_status: "manual",
    provider_error_code: null,
    last_checked_at: null,
    created_at: new Date("2026-09-30T10:00:00Z"),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  policyMock.canAccessInternalWorkspace.mockResolvedValue(true);
  dbMock.db.select.mockReturnValueOnce(chain([WORKSPACE])).mockReturnValueOnce(chain(WATCHLIST));
});

describe("laratik_planner_list_research", () => {
  it("registers a read-only research tool", async () => {
    const client = await connect(["content:read"]);
    const { tools } = await client.listTools();
    const tool = tools.find((entry) => entry.name === "laratik_planner_list_research");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it("returns workspace metadata and source-only watchlist rows", async () => {
    const client = await connect(["content:read"]);
    const response = await call(client, { workspace_id: WORKSPACE_ID, item_kind: "watchlist" });
    expect(response.isError).not.toBe(true);
    const payload = response.structuredContent?.result as {
      workspace: { slug: string; timezone: string };
      watchlist: Array<{ handle: string; provider_status: string }>;
      collections: unknown[];
    };
    expect(payload.workspace).toEqual({
      name: "Acme Workspace",
      slug: "acme",
      timezone: "Europe/Berlin",
    });
    expect(payload.watchlist).toEqual([
      expect.objectContaining({ handle: "example_brand", provider_status: "manual" }),
    ]);
    expect(payload.collections).toEqual([]);
  });

  it("requires content read access before reading the workspace", async () => {
    const client = await connect(["platform:diagnostics:read"]);
    const response = await call(client, { workspace_id: WORKSPACE_ID });
    expect(response.isError).toBe(true);
    expect(response.content?.[0]?.text).toContain("content:read");
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });

  it("hides inaccessible workspaces", async () => {
    policyMock.canAccessInternalWorkspace.mockResolvedValue(false);
    const client = await connect(["content:read"]);
    const response = await call(client, { workspace_id: WORKSPACE_ID });
    expect(response.isError).toBe(true);
    expect(response.content?.[0]?.text).toContain("Workspace not found");
    expect(dbMock.db.select).toHaveBeenCalledTimes(1);
  });
});
