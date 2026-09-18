import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import {
  agencies,
  agencyMemberships,
  brandAssets,
  brandLinkedResources,
  brandPublishingRules,
  brandVoiceRules,
  contentPillars,
  users,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaces,
} from "@/lib/db/schema";
import { createLaraTikPlannerMcpServer } from "@/lib/mcp/server";

/**
 * Integration coverage for the two brand-kit MCP tools
 * (`laratik_planner_export_brand_kit` and `laratik_planner_import_brand_kit`).
 *
 * Runs only when `TEST_DATABASE_URL` is set — same pattern as
 * `tests/integration/brand-kit.test.ts`. We exercise the real
 * `McpServer` through `Client` + `InMemoryTransport` (the SDK's
 * documented test pairing) so the tool handlers, the brand-service
 * layer, the storage adapter, and the conflict-strategy loops all run
 * end-to-end. Uploads are redirected to a tmp dir via `UPLOADS_DIR`
 * so the test does not touch `/data`.
 *
 * Assertions are scoped to evaluation cases 11–17 in
 * `docs/api/mcp-evaluation.xml`:
 *   11 — export returns every brand-kit kind for an accessible workspace
 *   12 — import with merge skips duplicates, creates new
 *   13 — import with fail rejects on first duplicate
 *   14 — import with overwrite requires confirm=true
 *   15 — logo entries accept exactly one of external_url/source_url/base64
 *   16 — oversized logo source_url is rejected per-row, rest of import
 *        continues
 *   17 — both tools reject requests against an inaccessible workspace
 */
const TEST_DB_URL = process.env.TEST_DATABASE_URL;
if (!TEST_DB_URL) throw new Error("TEST_DATABASE_URL is required for integration tests");

const pool = new Pool({ connectionString: TEST_DB_URL });
const db = drizzle(pool);

// Local-volume storage adapter writes into UPLOADS_DIR. Default is
// /data/uploads which does not exist in the unit/CI runner; redirect
// to a tmp dir so each test can clean up after itself.
const UPLOADS = join(tmpdir(), `laratik-mcp-brand-kit-${randomUUID()}`);
mkdirSync(UPLOADS, { recursive: true });
process.env.UPLOADS_DIR = UPLOADS;

type SeededWorkspace = {
  agencyId: string;
  workspaceId: string;
  managerUserId: string;
  outsiderUserId: string;
};

async function seedWorkspace(): Promise<SeededWorkspace> {
  const [agency] = await db
    .insert(agencies)
    .values({
      name: `Brand Kit ${randomUUID().slice(0, 8)}`,
      slug: `bk-${randomUUID().slice(0, 8)}`,
    })
    .returning();
  const [manager] = await db
    .insert(users)
    .values({
      email: `mgr-${randomUUID().slice(0, 8)}@brand.test`,
      displayName: "Manager",
    })
    .returning();
  const [outsider] = await db
    .insert(users)
    .values({
      email: `out-${randomUUID().slice(0, 8)}@brand.test`,
      displayName: "Outsider",
    })
    .returning();
  await db.insert(agencyMemberships).values({
    agencyId: agency!.id,
    userId: manager!.id,
    status: "active",
    isAgencyAdmin: true,
  });
  await db.insert(agencyMemberships).values({
    agencyId: agency!.id,
    userId: outsider!.id,
    status: "active",
    isAgencyAdmin: false,
  });
  const [workspace] = await db
    .insert(workspaces)
    .values({
      agencyId: agency!.id,
      slug: `main-${randomUUID().slice(0, 8)}`,
      name: "Main",
      createdBy: manager!.id,
      status: "active",
    })
    .returning();
  const [membership] = await db
    .insert(workspaceMemberships)
    .values({
      workspaceId: workspace!.id,
      userId: manager!.id,
      status: "active",
    })
    .returning();
  await db.insert(workspaceMembershipRoles).values({
    workspaceMembershipId: membership!.id,
    role: "workspace_manager",
  });
  return {
    agencyId: agency!.id,
    workspaceId: workspace!.id,
    managerUserId: manager!.id,
    outsiderUserId: outsider!.id,
  };
}

async function callTool<T>(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await client.callTool({ name, arguments: args });
  if ("isError" in response && response.isError) {
    const text = Array.isArray(response.content)
      ? response.content.find((c) => c.type === "text")?.text
      : undefined;
    throw new Error(`Tool ${name} failed: ${text ?? "unknown"}`);
  }
  const text = Array.isArray(response.content)
    ? response.content.find((c) => c.type === "text")?.text
    : undefined;
  if (typeof text !== "string") {
    throw new Error(`Tool ${name} returned no text content`);
  }
  return JSON.parse(text) as T;
}

describe("MCP brand-kit tools", () => {
  beforeAll(async () => {
    await migrate(db, { migrationsFolder: "./src/lib/db/migrations" });
  });

  beforeEach(async () => {
    await db.execute(sql`
      TRUNCATE
        brand_publishing_rule, brand_linked_resource,
        publication_record, content_item_channel, content_item,
        social_channel, brand_asset, brand_voice_rule,
        content_assignment, content_template, content_pillar, campaign,
        workspace_membership_role, workspace_membership, workspace_settings,
        workspace, invitation_workspace_role, invitation,
        agency_membership, bootstrap_lock, agency, "user"
      RESTART IDENTITY CASCADE
    `);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("exports the full brand-kit envelope for an accessible workspace (case 11)", async () => {
    const seeded = await seedWorkspace();
    await db.insert(brandVoiceRules).values([
      {
        workspaceId: seeded.workspaceId,
        createdBy: seeded.managerUserId,
        ruleType: "tone",
        content: "warm but precise",
      },
      {
        workspaceId: seeded.workspaceId,
        createdBy: seeded.managerUserId,
        ruleType: "do",
        content: "always mention the brand name once per caption",
      },
    ]);
    await db.insert(brandPublishingRules).values({
      workspaceId: seeded.workspaceId,
      createdBy: seeded.managerUserId,
      ruleType: "alt_text",
      title: "Describe the subject",
      content: "Alt text must describe the subject in the first 12 words.",
    });
    await db.insert(brandLinkedResources).values({
      workspaceId: seeded.workspaceId,
      createdBy: seeded.managerUserId,
      provider: "figma",
      name: "Brand library",
      url: "https://figma.com/file/abc",
    });
    await db.insert(brandAssets).values([
      {
        workspaceId: seeded.workspaceId,
        createdBy: seeded.managerUserId,
        kind: "color",
        name: "Brand Red",
        value: { hex: "#C8102E" },
        colorRole: "primary",
      },
      {
        workspaceId: seeded.workspaceId,
        createdBy: seeded.managerUserId,
        kind: "font",
        name: "Headline",
        value: { family: "Inter", weight: 700, role: "headline" },
      },
    ]);
    await db.insert(contentPillars).values({
      workspaceId: seeded.workspaceId,
      createdBy: seeded.managerUserId,
      name: "Education",
      color: "#0EA5E9",
      description: "How-to and explainer content",
    });

    const server = createLaraTikPlannerMcpServer({
      actor: { id: seeded.managerUserId },
      scopes: ["content:read", "content:write"],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const envelope = await callTool<{
      workspace_id: string;
      brand_assets: {
        logos: unknown[];
        colors: { name: string; hex: string; color_role: string }[];
        fonts: { name: string; family: string; weight: number; role: string }[];
        other: unknown[];
      };
      voice_rules: { rule_type: string; content: string }[];
      publishing_rules: { rule_type: string; title: string; content: string }[];
      linked_resources: { provider: string; url: string }[];
      content_pillars: { name: string }[];
    }>(client, "laratik_planner_export_brand_kit", {
      workspace_id: seeded.workspaceId,
      response_format: "json",
    });

    expect(envelope.workspace_id).toBe(seeded.workspaceId);
    expect(envelope.brand_assets.logos).toEqual([]);
    expect(envelope.brand_assets.colors).toHaveLength(1);
    expect(envelope.brand_assets.colors[0]).toMatchObject({
      name: "Brand Red",
      hex: "#C8102E",
      color_role: "primary",
    });
    expect(envelope.brand_assets.fonts).toHaveLength(1);
    expect(envelope.brand_assets.fonts[0]).toMatchObject({
      name: "Headline",
      family: "Inter",
      weight: 700,
      role: "headline",
    });
    expect(envelope.voice_rules).toHaveLength(2);
    expect(envelope.publishing_rules).toHaveLength(1);
    expect(envelope.linked_resources).toHaveLength(1);
    expect(envelope.content_pillars).toHaveLength(1);

    await client.close();
  });

  it("imports into a fresh workspace with merge strategy; skips duplicates (case 12)", async () => {
    const seeded = await seedWorkspace();
    // Pre-seed one color in the target workspace to exercise merge.
    await db.insert(brandAssets).values({
      workspaceId: seeded.workspaceId,
      createdBy: seeded.managerUserId,
      kind: "color",
      name: "Brand Red",
      value: { hex: "#000000" },
      colorRole: "primary",
    });

    const server = createLaraTikPlannerMcpServer({
      actor: { id: seeded.managerUserId },
      scopes: ["content:read", "content:write"],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const summary = await callTool<{
      created: { colors: number; voice_rules: number };
      skipped: { colors: string[] };
      failed: unknown[];
    }>(client, "laratik_planner_import_brand_kit", {
      workspace_id: seeded.workspaceId,
      conflict_strategy: "merge",
      colors: [
        { name: "Brand Red", hex: "#C8102E", color_role: "primary" },
        { name: "Brand Blue", hex: "#0EA5E9", color_role: "secondary" },
      ],
      voice_rules: [{ rule_type: "tone", content: "warm but precise" }],
      response_format: "json",
    });

    expect(summary.created.colors).toBe(1);
    expect(summary.created.voice_rules).toBe(1);
    expect(summary.skipped.colors).toEqual(["Brand Red"]);

    const targetColors = await db
      .select()
      .from(brandAssets)
      .where(sql`workspace_id = ${seeded.workspaceId}`);
    expect(targetColors.filter((row) => row.kind === "color")).toHaveLength(2);
    // Existing color was not overwritten by the merge.
    const existing = targetColors.find((row) => row.name === "Brand Red");
    expect(existing?.value).toEqual({ hex: "#000000" });

    await client.close();
  });

  it("rejects on first duplicate when conflict_strategy='fail' (case 13)", async () => {
    const seeded = await seedWorkspace();
    await db.insert(brandAssets).values({
      workspaceId: seeded.workspaceId,
      createdBy: seeded.managerUserId,
      kind: "color",
      name: "Brand Red",
      value: { hex: "#C8102E" },
      colorRole: "primary",
    });

    const server = createLaraTikPlannerMcpServer({
      actor: { id: seeded.managerUserId },
      scopes: ["content:read", "content:write"],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const response = await client.callTool({
      name: "laratik_planner_import_brand_kit",
      arguments: {
        workspace_id: seeded.workspaceId,
        conflict_strategy: "fail",
        colors: [
          { name: "Brand Red", hex: "#C8102E", color_role: "primary" },
          { name: "Brand Blue", hex: "#0EA5E9", color_role: "secondary" },
        ],
        response_format: "json",
      },
    });

    expect(response.isError).toBe(true);
    const text = Array.isArray(response.content)
      ? response.content.find((c) => c.type === "text")?.text
      : "";
    expect(text).toContain('Color "Brand Red" already exists');

    // The fail strategy aborted before any partial writes; the second
    // color was never attempted.
    const targetColors = await db
      .select()
      .from(brandAssets)
      .where(sql`workspace_id = ${seeded.workspaceId}`);
    expect(targetColors.filter((row) => row.kind === "color")).toHaveLength(1);

    await client.close();
  });

  it("rejects overwrite without confirm=true (case 14 input validation)", async () => {
    const seeded = await seedWorkspace();
    const server = createLaraTikPlannerMcpServer({
      actor: { id: seeded.managerUserId },
      scopes: ["content:read", "content:write"],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const response = await client.callTool({
      name: "laratik_planner_import_brand_kit",
      arguments: {
        workspace_id: seeded.workspaceId,
        conflict_strategy: "overwrite",
        confirm: false,
        colors: [{ name: "Brand Red", hex: "#C8102E", color_role: "primary" }],
        response_format: "json",
      },
    });

    expect(response.isError).toBe(true);
    const text = Array.isArray(response.content)
      ? response.content.find((c) => c.type === "text")?.text
      : "";
    expect(text).toMatch(/confirm=true/);

    await client.close();
  });

  it("rejects logo entries that omit or duplicate the binary source (case 15)", async () => {
    const seeded = await seedWorkspace();
    const server = createLaraTikPlannerMcpServer({
      actor: { id: seeded.managerUserId },
      scopes: ["content:read", "content:write"],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const emptyResponse = await client.callTool({
      name: "laratik_planner_import_brand_kit",
      arguments: {
        workspace_id: seeded.workspaceId,
        logos: [{ name: "primary", mime_type: "image/png", ext: "png" }],
        response_format: "json",
      },
    });
    expect(emptyResponse.isError).toBe(true);
    expect(
      Array.isArray(emptyResponse.content)
        ? emptyResponse.content.find((c) => c.type === "text")?.text
        : "",
    ).toMatch(/external_url, source_url, or base64/);

    const bothResponse = await client.callTool({
      name: "laratik_planner_import_brand_kit",
      arguments: {
        workspace_id: seeded.workspaceId,
        logos: [
          {
            name: "primary",
            external_url: "https://example.com/logo.png",
            base64: "iVBORw0KGgo=",
            mime_type: "image/png",
            ext: "png",
          },
        ],
        response_format: "json",
      },
    });
    expect(bothResponse.isError).toBe(true);
    expect(
      Array.isArray(bothResponse.content)
        ? bothResponse.content.find((c) => c.type === "text")?.text
        : "",
    ).toMatch(/external_url, source_url, or base64/);

    await client.close();
  });

  it("reports per-row failure for an oversized source_url and continues (case 16)", async () => {
    const seeded = await seedWorkspace();
    const server = createLaraTikPlannerMcpServer({
      actor: { id: seeded.managerUserId },
      scopes: ["content:read", "content:write"],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    // Drive the global fetch used by fetchLogoBuffer with a stub that
    // returns Content-Length: 99999999 so the cap rejects before the
    // body arrives. Vitest's vi.stubGlobal is the documented hook.
    const { vi } = await import("vitest");
    const originalFetch = globalThis.fetch;
    const stub = vi.fn(async () => {
      return new Response("body", {
        status: 200,
        headers: { "content-type": "image/png", "content-length": "99999999" },
      });
    });
    globalThis.fetch = stub as unknown as typeof fetch;
    try {
      const summary = await callTool<{
        created: { colors: number; logos: number };
        failed: { kind: string; name: string; message: string }[];
      }>(client, "laratik_planner_import_brand_kit", {
        workspace_id: seeded.workspaceId,
        conflict_strategy: "merge",
        logos: [
          {
            name: "primary",
            source_url: "https://example.com/huge.png",
            mime_type: "image/png",
            ext: "png",
          },
        ],
        colors: [{ name: "Brand Red", hex: "#C8102E", color_role: "primary" }],
        response_format: "json",
      });
      expect(summary.created.colors).toBe(1);
      expect(summary.created.logos).toBe(0);
      expect(summary.failed).toHaveLength(1);
      expect(summary.failed[0]?.kind).toBe("logo");
      expect(summary.failed[0]?.message).toMatch(/10 MB cap/);
    } finally {
      globalThis.fetch = originalFetch;
    }

    await client.close();
  });

  it("rejects requests against a workspace the actor cannot access (case 17)", async () => {
    const seeded = await seedWorkspace();
    // Spin up a second agency the manager is NOT a member of.
    const [otherAgency] = await db
      .insert(agencies)
      .values({
        name: `Other ${randomUUID().slice(0, 8)}`,
        slug: `other-${randomUUID().slice(0, 8)}`,
      })
      .returning();
    const [otherOwner] = await db
      .insert(users)
      .values({
        email: `other-${randomUUID().slice(0, 8)}@brand.test`,
        displayName: "Other Owner",
      })
      .returning();
    await db.insert(agencyMemberships).values({
      agencyId: otherAgency!.id,
      userId: otherOwner!.id,
      status: "active",
      isAgencyAdmin: true,
    });
    const [otherWorkspace] = await db
      .insert(workspaces)
      .values({
        agencyId: otherAgency!.id,
        slug: `other-${randomUUID().slice(0, 8)}`,
        name: "Other",
        createdBy: otherOwner!.id,
        status: "active",
      })
      .returning();

    const server = createLaraTikPlannerMcpServer({
      actor: { id: seeded.managerUserId },
      scopes: ["content:read", "content:write"],
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test-client", version: "0.0.0" }, { capabilities: {} });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const response = await client.callTool({
      name: "laratik_planner_export_brand_kit",
      arguments: {
        workspace_id: otherWorkspace!.id,
        response_format: "json",
      },
    });
    expect(response.isError).toBe(true);
    expect(
      Array.isArray(response.content) ? response.content.find((c) => c.type === "text")?.text : "",
    ).toMatch(/Workspace not found/i);

    await client.close();
  });
});
