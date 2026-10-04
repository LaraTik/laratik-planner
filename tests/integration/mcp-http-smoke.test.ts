import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  agencyMemberships,
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { issueMcpAccessToken, revokeMcpAccessToken } from "@/lib/mcp/tokens";
import { POST } from "@/app/api/mcp/route";

const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

async function seedWorkspace() {
  const [agency] = await db
    .insert(agencies)
    .values({ name: "MCP HTTP Smoke Agency", slug: `mcp-http-${randomUUID().slice(0, 8)}` })
    .returning();
  const [user] = await db
    .insert(users)
    .values({
      email: `mcp-http-${randomUUID().slice(0, 8)}@integration.test`,
      displayName: "MCP HTTP Smoke",
    })
    .returning();
  await db.insert(agencyMemberships).values({
    agencyId: agency!.id,
    userId: user!.id,
    status: "active",
    isAgencyAdmin: true,
  });
  const [workspace] = await db
    .insert(workspaces)
    .values({
      agencyId: agency!.id,
      slug: `mcp-workspace-${randomUUID().slice(0, 8)}`,
      name: "MCP HTTP Smoke Workspace",
      createdBy: user!.id,
      status: "active",
    })
    .returning();
  const [membership] = await db
    .insert(workspaceMemberships)
    .values({ workspaceId: workspace!.id, userId: user!.id, status: "active" })
    .returning();
  await db.insert(workspaceMembershipRoles).values({
    workspaceMembershipId: membership!.id,
    role: "workspace_manager",
  });
  return { userId: user!.id, workspaceId: workspace!.id };
}

async function postMcp(token: string, body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        host: "localhost",
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("authenticated MCP HTTP transport", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        mcp_access_token, rate_limit_event,
        workspace_membership_role, workspace_membership, workspace_settings,
        workspace, invitation_workspace_role, invitation,
        agency_membership, bootstrap_lock, agency, "user"
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("issues diagnostics-capable tokens and completes initialize/list/call/revoke", async () => {
    const seeded = await seedWorkspace();
    const issued = await issueMcpAccessToken({
      userId: seeded.userId,
      name: "Integration HTTP smoke",
      scopes: ["content:read", "platform:diagnostics:read"],
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const initialized = await postMcp(issued.token, {
      jsonrpc: "2.0",
      id: "initialize",
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "integration-smoke", version: "1.0.0" },
      },
    });
    expect(initialized.status).toBe(200);
    const initializeBody = (await initialized.json()) as {
      result?: { serverInfo?: { name?: string } };
    };
    expect(initializeBody.result?.serverInfo?.name).toBe("laratik-planner");

    const listed = await postMcp(issued.token, {
      jsonrpc: "2.0",
      id: "tools-list",
      method: "tools/list",
      params: {},
    });
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      result?: { tools?: Array<{ name?: string }> };
    };
    expect(
      listBody.result?.tools?.some((tool) => tool.name === "laratik_planner_list_research"),
    ).toBe(true);

    const research = await postMcp(issued.token, {
      jsonrpc: "2.0",
      id: "research",
      method: "tools/call",
      params: {
        name: "laratik_planner_list_research",
        arguments: { workspace_id: seeded.workspaceId, item_kind: "all", limit: 10 },
      },
    });
    expect(research.status).toBe(200);
    const researchBody = (await research.json()) as {
      result?: { isError?: boolean; structuredContent?: { result?: Record<string, unknown> } };
    };
    expect(researchBody.result?.isError).not.toBe(true);
    expect(researchBody.result?.structuredContent?.result).toEqual(
      expect.objectContaining({
        workspace_id: seeded.workspaceId,
        collections: [],
        bookmarks: [],
        teardowns: [],
        watchlist: [],
      }),
    );

    expect(await revokeMcpAccessToken(seeded.userId, issued.id)).toBe(true);
    const revoked = await postMcp(issued.token, {
      jsonrpc: "2.0",
      id: "revoked",
      method: "tools/list",
      params: {},
    });
    expect(revoked.status).toBe(401);
  });
});
