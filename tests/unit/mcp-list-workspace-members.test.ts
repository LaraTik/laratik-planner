import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/**
 * Contract coverage for `laratik_planner_list_workspace_members`.
 *
 * Every other tool in this server hands callers bare UUIDs — `list_content`
 * returns `contentOwnerId` / `designerId` / `clientReviewerId`, and
 * `get_content` returns `assignments: [{ assignmentType, userId }]`. Any
 * caller that groups work per person (a daily ops report, a workload
 * rollup) had no way to turn those ids into names, so the only workarounds
 * were a hand-kept id→name map (rots when someone joins) or grouping by
 * role only (hides who is actually carrying the work). These tests pin the
 * behaviour that closes that gap: names come from the authoritative tables,
 * roles are grouped per membership rather than per row, and the two
 * authorization gates hold.
 *
 * The database is mocked; this file is about the tool contract and the
 * gates. Persistence of memberships and roles is exercised by the schema
 * tests, not here.
 */

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

/** A drizzle-shaped chainable that resolves to `rows`. */
function chain(rows: unknown[]) {
  const q: Record<string, unknown> = {};
  for (const method of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    q[method] = vi.fn(() => q);
  }
  q.then = (resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return q;
}

async function connect(scopes: McpTokenScope[]) {
  const server = createLaraTikPlannerMcpServer({ actor: ACTOR, scopes });
  const client = new Client({ name: "test", version: "1.0.0" });
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

const MEMBERS = [
  {
    membershipId: "m-1",
    userId: "u-1",
    status: "active",
    displayName: "Ghaleb Karmanshahi",
    email: "ghaleb@laratik.com",
    lastActiveAt: new Date("2026-09-29T10:00:00Z"),
  },
  {
    membershipId: "m-2",
    userId: "u-2",
    status: "active",
    displayName: "Reza Ahmadi",
    email: "reza@laratik.com",
    lastActiveAt: new Date("2026-09-28T10:00:00Z"),
  },
  {
    membershipId: "m-3",
    userId: "u-3",
    status: "active",
    displayName: "No Roles Holder",
    email: "solo@laratik.com",
    lastActiveAt: null,
  },
];

const ROLES = [
  { membershipId: "m-1", role: "designer" },
  { membershipId: "m-1", role: "viewer" },
  { membershipId: "m-2", role: "workspace_manager" },
  { membershipId: "m-2", role: "content_planner" },
];

beforeEach(() => {
  vi.clearAllMocks();
  policyMock.canAccessInternalWorkspace.mockResolvedValue(true);
  dbMock.db.select.mockReturnValueOnce(chain(MEMBERS)).mockReturnValueOnce(chain(ROLES));
});

describe("tool registration", () => {
  it("registers list_workspace_members with the laratik_planner_ prefix", async () => {
    const client = await connect(["content:read"]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["laratik_planner_list_workspace_members"]),
    );
  });

  it("is annotated read-only", async () => {
    const client = await connect(["content:read"]);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "laratik_planner_list_workspace_members");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });
});

describe("name resolution — the reason this tool exists", () => {
  it("returns a display name for every member, not just a UUID", async () => {
    const client = await connect(["content:read"]);
    const out = await call(client, "laratik_planner_list_workspace_members", {
      workspace_id: WORKSPACE_ID,
    });
    expect(out.isError).toBe(false);
    const members = (out.structured as { result: Array<Record<string, unknown>> }).result;
    expect(members).toHaveLength(3);
    expect(members.map((m) => m.displayName)).toEqual([
      "Ghaleb Karmanshahi",
      "Reza Ahmadi",
      "No Roles Holder",
    ]);
    for (const member of members) {
      expect(typeof member.displayName).toBe("string");
      expect((member.displayName as string).length).toBeGreaterThan(0);
    }
  });

  it("groups every role under the right membership, not per row", async () => {
    const client = await connect(["content:read"]);
    const out = await call(client, "laratik_planner_list_workspace_members", {
      workspace_id: WORKSPACE_ID,
    });
    const members = (out.structured as { result: Array<Record<string, unknown>> }).result;
    const byName = Object.fromEntries(members.map((m) => [m.displayName, m.roles]));

    // Two role rows for one membership must collapse into one member, and the
    // second member's roles must not bleed into the first.
    expect(byName["Ghaleb Karmanshahi"]).toEqual(["designer", "viewer"]);
    expect(byName["Reza Ahmadi"]).toEqual(["workspace_manager", "content_planner"]);
  });

  it("reports an empty role array rather than omitting the field", async () => {
    const client = await connect(["content:read"]);
    const out = await call(client, "laratik_planner_list_workspace_members", {
      workspace_id: WORKSPACE_ID,
    });
    const members = (out.structured as { result: Array<Record<string, unknown>> }).result;
    const solo = members.find((m) => m.displayName === "No Roles Holder");
    // A user with no role row is still a member. The field is always present
    // so a caller can rely on its shape.
    expect(solo).toBeDefined();
    expect(solo?.roles).toEqual([]);
  });

  it("returns an empty list for a workspace with no memberships", async () => {
    dbMock.db.select.mockReset().mockReturnValueOnce(chain([]));
    const client = await connect(["content:read"]);
    const out = await call(client, "laratik_planner_list_workspace_members", {
      workspace_id: WORKSPACE_ID,
    });
    expect(out.isError).toBe(false);
    expect((out.structured as { result: unknown[] }).result).toEqual([]);
  });
});

describe("gate 1 — token scope", () => {
  it("refuses a token with no content scope", async () => {
    const client = await connect(["platform:diagnostics:read"]);
    const out = await call(client, "laratik_planner_list_workspace_members", {
      workspace_id: WORKSPACE_ID,
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("content:read");
    // The workspace gate is never reached, and nothing is read.
    expect(policyMock.canAccessInternalWorkspace).not.toHaveBeenCalled();
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });

  it("accepts a write-only token, because content:write implies content:read", async () => {
    const client = await connect(["content:write"]);
    const out = await call(client, "laratik_planner_list_workspace_members", {
      workspace_id: WORKSPACE_ID,
    });
    expect(out.isError).toBe(false);
  });
});

describe("gate 2 — workspace access", () => {
  it("refuses an actor who cannot access the workspace", async () => {
    policyMock.canAccessInternalWorkspace.mockResolvedValue(false);
    const client = await connect(["content:read"]);
    const out = await call(client, "laratik_planner_list_workspace_members", {
      workspace_id: WORKSPACE_ID,
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("do not have permission");
    expect(dbMock.db.select).not.toHaveBeenCalled();
  });
});
