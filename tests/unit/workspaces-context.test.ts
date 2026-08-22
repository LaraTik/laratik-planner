import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Workspace access/context tests — exercise the agency-singleton +
 * membership lookup paths for the workspace switcher, internal access
 * gate, and client-only access gate.
 */

type DrizzleState = {
  selectResults: unknown[][];
};

function makeDrizzleMock(state: DrizzleState) {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => {
      const rows = state.selectResults.shift() ?? [];
      return Promise.resolve(rows);
    });
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);
  return { select, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = { selectResults: [] };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// M1.6 — the SUT now reads `resolveActiveAgencyContext({ actor })`
// (which reads cookies()). We mock `next/headers` so the unit test
// can stand up without a real Next request.
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

const policyMock = vi.hoisted(() => ({
  resolverResult: { agencyId: "agency-1", source: "fallback-single-agency" as const } as {
    agencyId: string;
    source: "requested" | "cookie" | "fallback-single-agency";
  } | null,
  isAgencyAdmin: vi.fn(async () => false as boolean),
  canAccessInternalWorkspace: vi.fn(async () => false as boolean),
  canAccessClientWorkspace: vi.fn(async () => false as boolean),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return {
    ...actual,
    isAgencyAdmin: policyMock.isAgencyAdmin,
    canAccessInternalWorkspace: policyMock.canAccessInternalWorkspace,
    canAccessClientWorkspace: policyMock.canAccessClientWorkspace,
  };
});

vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: vi.fn(async () => policyMock.resolverResult),
}));

const context = await import("@/lib/workspaces/context");

const actor = { id: "user-1" };

beforeEach(() => {
  dbMock.state.selectResults = [];
  policyMock.resolverResult = { agencyId: "agency-1", source: "fallback-single-agency" };
  policyMock.isAgencyAdmin.mockReset();
  policyMock.isAgencyAdmin.mockResolvedValue(false);
  policyMock.canAccessInternalWorkspace.mockReset();
  policyMock.canAccessInternalWorkspace.mockResolvedValue(false);
  policyMock.canAccessClientWorkspace.mockReset();
  policyMock.canAccessClientWorkspace.mockResolvedValue(false);
});

describe("getAccessibleWorkspace", () => {
  it("returns null when there is no active agency", async () => {
    policyMock.resolverResult = null;
    const result = await context.getAccessibleWorkspace(actor, "any");
    expect(result).toBeNull();
  });

  it("returns null when no workspace matches the slug", async () => {
    dbMock.state.selectResults = [[]];
    expect(await context.getAccessibleWorkspace(actor, "nope")).toBeNull();
  });

  it("returns null when the actor cannot access the workspace internally", async () => {
    dbMock.state.selectResults = [[{ id: "ws-1", slug: "alpha", name: "Alpha" }]];
    policyMock.canAccessInternalWorkspace.mockResolvedValue(false);
    expect(await context.getAccessibleWorkspace(actor, "alpha")).toBeNull();
  });

  it("returns the workspace row when the actor has internal access", async () => {
    const row = { id: "ws-1", slug: "alpha", name: "Alpha" };
    dbMock.state.selectResults = [[row]];
    policyMock.canAccessInternalWorkspace.mockResolvedValue(true);
    expect(await context.getAccessibleWorkspace(actor, "alpha")).toEqual(row);
  });
});

describe("getClientWorkspace", () => {
  it("returns null when the actor cannot access the client surface", async () => {
    dbMock.state.selectResults = [[{ id: "ws-1", slug: "alpha" }]];
    policyMock.canAccessClientWorkspace.mockResolvedValue(false);
    expect(await context.getClientWorkspace(actor, "alpha")).toBeNull();
  });

  it("returns the workspace row when the actor has client access", async () => {
    const row = { id: "ws-1", slug: "alpha", name: "Alpha" };
    dbMock.state.selectResults = [[row]];
    policyMock.canAccessClientWorkspace.mockResolvedValue(true);
    expect(await context.getClientWorkspace(actor, "alpha")).toEqual(row);
  });
});

describe("listSwitcherWorkspaces", () => {
  it("returns empty options and isAdmin=false when no agency exists", async () => {
    policyMock.resolverResult = null;
    const result = await context.listSwitcherWorkspaces(actor);
    expect(result).toEqual({ options: [], isAdmin: false });
  });

  it("returns only the member rows for a non-admin", async () => {
    policyMock.isAgencyAdmin.mockResolvedValue(false);
    dbMock.state.selectResults = [[{ id: "ws-1", name: "Alpha", slug: "alpha" }]];
    const result = await context.listSwitcherWorkspaces(actor);
    expect(result.isAdmin).toBe(false);
    expect(result.options).toEqual([{ id: "ws-1", name: "Alpha", slug: "alpha" }]);
  });

  it("merges member rows + every agency workspace for an admin (deduped)", async () => {
    policyMock.isAgencyAdmin.mockResolvedValue(true);
    // Member rows query
    dbMock.state.selectResults = [[{ id: "ws-1", name: "Alpha", slug: "alpha" }]];
    // All-agency workspace query (includes ws-1 again + ws-2)
    dbMock.state.selectResults = [
      [
        { id: "ws-1", name: "Alpha", slug: "alpha" },
        { id: "ws-2", name: "Beta", slug: "beta" },
      ],
    ];

    const result = await context.listSwitcherWorkspaces(actor);
    expect(result.isAdmin).toBe(true);
    expect(result.options.map((w) => w.id)).toEqual(["ws-1", "ws-2"]);
  });
});
