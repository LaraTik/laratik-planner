import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

/**
 * Authorization and contract coverage for the five error-diagnostics MCP
 * tools.
 *
 * The point of most of these assertions is the **two gates**: a token
 * holding `platform:diagnostics:read` is still refused when the actor
 * lacks `platform.console.read`. `app_error_event` is cross-tenant, so a
 * scope check on its own would let any workspace member read another
 * agency's failures.
 *
 * The database is mocked; this file is about the gate and the tool
 * contract. End-to-end persistence (grouping, the burst cap, retention)
 * lives in `tests/integration/error-diagnostics.test.ts`.
 */

const appErrorsMock = vi.hoisted(() => ({
  getAppErrorById: vi.fn(),
  getAppErrorDiagnostics: vi.fn(),
  getAppErrorHealth: vi.fn(),
  listAppErrorGroups: vi.fn(),
  listAppErrors: vi.fn(),
  triageAppErrorGroup: vi.fn(),
}));
const platformAccessMock = vi.hoisted(() => ({ hasPlatformPermission: vi.fn() }));
const dbMock = vi.hoisted(() => ({ db: { select: vi.fn(), selectDistinct: vi.fn() } }));

vi.mock("@/lib/observability/app-errors", () => appErrorsMock);
vi.mock("@/lib/auth/platform-access", () => platformAccessMock);
vi.mock("@/lib/db", () => dbMock);
vi.mock("server-only", () => ({}));

import { createLaraTikPlannerMcpServer } from "@/lib/mcp/server";
import type { McpTokenScope } from "@/lib/mcp/tokens";

const ACTOR = { id: "00000000-0000-0000-0000-0000000000aa" };

/** Build a connected client for the given token scopes. */
async function connect(scopes: McpTokenScope[]) {
  const server = createLaraTikPlannerMcpServer({ actor: ACTOR, scopes });
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

/** Call a tool and return the parsed payload (or throw the MCP error). */
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

const READ = "platform:diagnostics:read" as const;
const WRITE = "platform:diagnostics:write" as const;

beforeEach(() => {
  vi.clearAllMocks();
  platformAccessMock.hasPlatformPermission.mockResolvedValue(true);
  appErrorsMock.listAppErrorGroups.mockResolvedValue([]);
  appErrorsMock.listAppErrors.mockResolvedValue({ rows: [], total: 0, matched: 0 });
  appErrorsMock.getAppErrorHealth.mockResolvedValue({
    ok: true,
    version: "abc1234",
    environment: "test",
    db: "reachable",
    lastHour: 0,
    last24h: 0,
    cappedOccurrences: 0,
    topGroups: [],
  });
  appErrorsMock.triageAppErrorGroup.mockResolvedValue({
    id: "g1",
    fingerprint: "0123456789ab",
    errorName: "TypeError",
    sampleMessage: "boom",
    route: "/api/x",
    source: "server.route",
    occurrenceCount: 3,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    resolvedAt: new Date(),
    triageNote: "known issue",
  });
});

describe("diagnostics tool registration", () => {
  it("registers all five tools with the laratik_planner_ prefix", async () => {
    const client = await connect([READ]);
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "laratik_planner_list_app_errors",
        "laratik_planner_get_app_error",
        "laratik_planner_diagnose_app_error",
        "laratik_planner_app_health",
        "laratik_planner_triage_app_error",
      ]),
    );
  });

  it("keeps the content and diagnostics tools plus the research shelf", async () => {
    const client = await connect([READ]);
    const { tools } = await client.listTools();
    // 15 content/brand tools + 5 diagnostics + 1 read-only research tool
    // + 1 read-only Command Center reader + 1 thumbnail backfill.
    expect(tools).toHaveLength(23);
    expect(tools.map((tool) => tool.name)).toContain("laratik_planner_list_research");
    expect(tools.map((tool) => tool.name)).toContain("laratik_planner_get_command_center");
    expect(tools.map((tool) => tool.name)).toContain("laratik_planner_backfill_thumbnails");
  });

  it("marks the thumbnail backfill as a WRITE, not a read", async () => {
    // The backfill spends provider quota and writes rows, so it must not
    // advertise itself as read-only.
    const client = await connect([READ]);
    const { tools } = await client.listTools();
    const backfill = tools.find((tool) => tool.name === "laratik_planner_backfill_thumbnails");
    expect(backfill?.annotations?.readOnlyHint).toBe(false);
  });

  it("exposes the Command Center reader as read-only", async () => {
    const client = await connect([READ]);
    const { tools } = await client.listTools();
    const commandCenter = tools.find((tool) => tool.name === "laratik_planner_get_command_center");
    expect(commandCenter?.annotations?.readOnlyHint).toBe(true);
  });
});

describe("gate 1 — token scope", () => {
  it.each([
    ["laratik_planner_list_app_errors", {}],
    ["laratik_planner_get_app_error", { fingerprint: "0123456789ab" }],
    ["laratik_planner_diagnose_app_error", { fingerprint: "0123456789ab" }],
    ["laratik_planner_app_health", {}],
    [
      "laratik_planner_triage_app_error",
      { fingerprint: "0123456789ab", action: "resolve", confirm: true },
    ],
  ])("%s refuses a token with no diagnostics scope", async (name, args) => {
    const client = await connect(["content:read", "content:write"]);
    const out = await call(client, name, args);
    expect(out.isError).toBe(true);
    expect(out.text).toContain("platform:diagnostics");
    // The platform gate is never even reached.
    expect(platformAccessMock.hasPlatformPermission).not.toHaveBeenCalled();
  });

  it("does not let a content scope imply a diagnostics scope", async () => {
    const client = await connect(["content:write"]);
    const out = await call(client, "laratik_planner_app_health");
    expect(out.isError).toBe(true);
    expect(out.text).toContain("scope");
  });

  it("accepts the write scope for a read tool", async () => {
    const client = await connect([WRITE]);
    const out = await call(client, "laratik_planner_app_health");
    expect(out.isError).toBe(false);
  });

  it("refuses the read scope for the triage tool", async () => {
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_triage_app_error", {
      fingerprint: "0123456789ab",
      action: "resolve",
      confirm: true,
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("platform:diagnostics:write");
  });
});

describe("gate 2 — platform permission (the cross-tenant guard)", () => {
  it("refuses a non-admin who holds the read scope", async () => {
    platformAccessMock.hasPlatformPermission.mockResolvedValue(false);
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_app_health");
    expect(out.isError).toBe(true);
    expect(out.text).toBe("You do not have permission to perform this operation.");
    // Critically: no data was read.
    expect(appErrorsMock.getAppErrorHealth).not.toHaveBeenCalled();
  });

  it("refuses a non-admin who holds the write scope", async () => {
    platformAccessMock.hasPlatformPermission.mockResolvedValue(false);
    const client = await connect([WRITE]);
    const out = await call(client, "laratik_planner_triage_app_error", {
      fingerprint: "0123456789ab",
      action: "resolve",
      confirm: true,
    });
    expect(out.isError).toBe(true);
    expect(appErrorsMock.triageAppErrorGroup).not.toHaveBeenCalled();
  });

  it("checks the platform.console.read permission specifically", async () => {
    const client = await connect([READ]);
    await call(client, "laratik_planner_app_health");
    expect(platformAccessMock.hasPlatformPermission).toHaveBeenCalledWith(
      ACTOR,
      "platform.console.read",
    );
  });
});

describe("laratik_planner_app_health", () => {
  it("returns the health payload", async () => {
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_app_health");
    expect(out.isError).toBe(false);
    const result = (out.structured as { result: Record<string, unknown> }).result;
    expect(result.ok).toBe(true);
    expect(result.version).toBe("abc1234");
    expect(result.last24h).toBe(0);
  });
});

describe("laratik_planner_list_app_errors", () => {
  it("returns grouped rows with counts and fingerprints", async () => {
    appErrorsMock.listAppErrorGroups.mockResolvedValue([
      {
        id: "g1",
        fingerprint: "0123456789ab",
        errorName: "TypeError",
        sampleMessage: "cannot read id",
        route: "/api/tasks",
        source: "server.route",
        occurrenceCount: 47,
        firstSeenAt: new Date("2026-09-27T10:00:00Z"),
        lastSeenAt: new Date("2026-09-27T14:02:00Z"),
        resolvedAt: null,
        triageNote: null,
      },
    ]);
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_list_app_errors");
    const result = (
      out.structured as { result: { count: number; groups: Array<Record<string, unknown>> } }
    ).result;
    expect(result.count).toBe(1);
    expect(result.groups[0]?.occurrenceCount).toBe(47);
    expect(result.groups[0]?.fingerprint).toBe("0123456789ab");
  });

  it("rejects a malformed fingerprint-shaped limit", async () => {
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_list_app_errors", { limit: 0 });
    expect(out.isError).toBe(true);
  });

  it("clamps an over-wide `since` to the 30-day window", async () => {
    const client = await connect([READ]);
    await call(client, "laratik_planner_list_app_errors", { since: "2020-01-01T00:00:00Z" });
    const arg = appErrorsMock.listAppErrorGroups.mock.calls[0]![0] as { since: Date };
    expect(arg.since.getTime()).toBeGreaterThan(Date.now() - 31 * 86_400_000);
  });

  it("rejects a malformed `since`", async () => {
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_list_app_errors", { since: "not-a-date" });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("ISO-8601");
  });
});

describe("laratik_planner_diagnose_app_error", () => {
  beforeEach(() => {
    appErrorsMock.getAppErrorDiagnostics.mockResolvedValue({
      group: {
        id: "g1",
        fingerprint: "0123456789ab",
        errorName: "ZodError",
        sampleMessage: "Invalid input",
        route: "/api/ai",
        source: "server_action",
        occurrenceCount: 12,
        firstSeenAt: new Date("2026-09-27T10:00:00Z"),
        lastSeenAt: new Date("2026-09-27T14:02:00Z"),
        resolvedAt: null,
        triageNote: null,
      },
      builds: ["aaa1111"],
      routes: ["/api/ai"],
      sources: ["server_action"],
      hourly: [{ hour: "2026-09-27T14:00:00Z", count: 12 }],
      recent: [
        {
          id: "e1",
          errorName: "ZodError",
          message: "Invalid input: expected string",
          causeMessage: null,
          route: "/api/ai",
          method: "POST",
          source: "server_action",
          routeType: "action",
          buildVersion: "aaa1111",
          createdAt: new Date("2026-09-27T14:02:00Z"),
          digest: undefined,
          componentStack: undefined,
        },
      ],
      cappedOccurrences: 0,
    });
  });

  it("returns a root-cause hypothesis plus the regression signal", async () => {
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_diagnose_app_error", {
      fingerprint: "0123456789ab",
    });
    expect(out.isError).toBe(false);
    const result = (
      out.structured as {
        result: {
          found: boolean;
          rootCause: { id: string; fixes: string[] } | null;
          occurrences: number;
          builds: string[];
          hourly: unknown[];
        };
      }
    ).result;
    expect(result.found).toBe(true);
    expect(result.occurrences).toBe(12);
    // The one build version is the regression signal.
    expect(result.builds).toEqual(["aaa1111"]);
    expect(result.hourly).toHaveLength(1);
    // A hint is always produced (the matcher has an `unknown` fallback).
    expect(result.rootCause?.id).toBeTruthy();
    expect(Array.isArray(result.rootCause?.fixes)).toBe(true);
  });

  it("reports found=false for an unknown fingerprint without erroring", async () => {
    appErrorsMock.getAppErrorDiagnostics.mockResolvedValue(null);
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_diagnose_app_error", {
      fingerprint: "0123456789ab",
    });
    expect(out.isError).toBe(false);
    expect((out.structured as { result: { found: boolean } }).result.found).toBe(false);
  });

  it("requires either a fingerprint or a query", async () => {
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_diagnose_app_error", {});
    expect(out.isError).toBe(true);
  });

  it("rejects a fingerprint that is not 12 hex characters", async () => {
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_diagnose_app_error", {
      fingerprint: "NOT-A-FINGERPRINT",
    });
    expect(out.isError).toBe(true);
  });
});

describe("laratik_planner_get_app_error", () => {
  it("requires exactly one identifier", async () => {
    const client = await connect([READ]);
    const none = await call(client, "laratik_planner_get_app_error", {});
    expect(none.isError).toBe(true);
    const both = await call(client, "laratik_planner_get_app_error", {
      fingerprint: "0123456789ab",
      request_id: "req-1",
    });
    expect(both.isError).toBe(true);
  });

  it("returns not_found when nothing matches", async () => {
    appErrorsMock.getAppErrorById.mockResolvedValue(null);
    const client = await connect([READ]);
    const out = await call(client, "laratik_planner_get_app_error", {
      id: "00000000-0000-0000-0000-000000000001",
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("No matching application error");
  });
});

describe("laratik_planner_triage_app_error", () => {
  it("refuses without confirm:true and performs no write", async () => {
    const client = await connect([WRITE]);
    const out = await call(client, "laratik_planner_triage_app_error", {
      fingerprint: "0123456789ab",
      action: "resolve",
      confirm: false,
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("confirm");
    expect(appErrorsMock.triageAppErrorGroup).not.toHaveBeenCalled();
  });

  it("writes when confirm:true and returns the updated state", async () => {
    const client = await connect([WRITE]);
    const out = await call(client, "laratik_planner_triage_app_error", {
      fingerprint: "0123456789ab",
      action: "resolve",
      note: "known upstream issue",
      confirm: true,
    });
    expect(out.isError).toBe(false);
    expect(appErrorsMock.triageAppErrorGroup).toHaveBeenCalledWith({
      fingerprint: "0123456789ab",
      action: "resolve",
      note: "known upstream issue",
    });
    const result = (out.structured as { result: { resolvedAt: string | null } }).result;
    expect(result.resolvedAt).toBeTruthy();
  });

  it("rejects an unknown action", async () => {
    const client = await connect([WRITE]);
    const out = await call(client, "laratik_planner_triage_app_error", {
      fingerprint: "0123456789ab",
      action: "delete",
      confirm: true,
    });
    expect(out.isError).toBe(true);
    expect(appErrorsMock.triageAppErrorGroup).not.toHaveBeenCalled();
  });

  it("reports not_found for an unknown fingerprint", async () => {
    appErrorsMock.triageAppErrorGroup.mockResolvedValue(null);
    const client = await connect([WRITE]);
    const out = await call(client, "laratik_planner_triage_app_error", {
      fingerprint: "0123456789ab",
      action: "resolve",
      confirm: true,
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("No error group");
  });
});
