import { describe, expect, it, vi, beforeEach } from "vitest";

// --- DB mock (Drizzle chainable) -------------------------------------------

type DrizzleMockState = {
  /** What the LIMIT-terminated query resolves to. Per test we set this
   *  to a per-call value: `memberRows` is returned on the first call
   *  (the member query), `adminRows` on the second (the admin-only
   *  query). The SUT only ever issues at most two LIMIT-terminated
   *  selects, so a simple counter is enough. */
  memberRows: { id: string; name: string; slug: string }[];
  adminRows: { id: string; name: string; slug: string }[];
  /** Captured WHERE args per call — used to assert the agency
   *  filter is on the member query (regression: pre-fix, the
   *  member query was not agency-scoped and contaminated the
   *  workspace switcher list for multi-agency users). */
  whereCalls: unknown[][];
};

function makeDrizzleMock(state: DrizzleMockState) {
  let callCount = 0;
  const chain: Record<string, unknown> = {};
  // The chain is chainable in any order; the only terminator is `.limit()`.
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn((...args: unknown[]) => {
    state.whereCalls.push(args);
    return chain;
  });
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => {
    callCount += 1;
    const rows = callCount === 1 ? state.memberRows : state.adminRows;
    return Promise.resolve(rows);
  });
  const select = vi.fn(() => chain);
  return { select, state };
}

// Hoist the mock so it's installed before the SUT is imported.
const dbMock = vi.hoisted(() => {
  const state: DrizzleMockState = { memberRows: [], adminRows: [], whereCalls: [] };
  return makeDrizzleMock(state);
});
vi.mock("@/lib/db", () => ({ db: dbMock }));

// Stub the auth policy module. We re-mock per-test in beforeEach to
// return different values for `isAgencyAdmin` (the agency membership
// gate). `listSwitcherWorkspaces` is a per-request UI helper, so it
// goes through `resolveActiveAgencyContext` (not the bootstrap
// `firstAgencyForBootstrap`) — the resolver itself has dedicated
// tests; we mock it here so the SUT can run without a real request
// scope.
const policyMock = vi.hoisted(() => ({
  isAgencyAdmin: vi.fn(async () => false as boolean),
}));
vi.mock("@/lib/auth/policy", () => policyMock);

// Mock the agency-context resolver. The SUT's
// `resolveActiveAgencyContext({ actor })` is the canonical agency
// resolution path; we override it for unit tests so the helper
// doesn't need a real Next request scope (cookies()).
const agencyContextMock = vi.hoisted(() => ({
  resolveActiveAgencyContext: vi.fn(
    async () =>
      ({ agencyId: "agency-1" as string | null, source: "fallback-single-agency" }) as {
        agencyId: string | null;
        source: string;
      } | null,
  ),
}));
vi.mock("@/lib/auth/agency-context", () => agencyContextMock);

// --- import the SUT (AFTER mocks) ------------------------------------------

const { listSwitcherWorkspaces } = await import("@/lib/workspaces/context");

// --- tests ----------------------------------------------------------------

beforeEach(() => {
  dbMock.state.memberRows = [];
  dbMock.state.adminRows = [];
  dbMock.state.whereCalls = [];
  policyMock.isAgencyAdmin.mockReset();
  policyMock.isAgencyAdmin.mockResolvedValue(false);
  agencyContextMock.resolveActiveAgencyContext.mockReset();
  agencyContextMock.resolveActiveAgencyContext.mockResolvedValue({
    agencyId: "agency-1",
    source: "fallback-single-agency",
  });
});

describe("listSwitcherWorkspaces", () => {
  it("returns an empty list with isAdmin=false when the user has no active agency", async () => {
    agencyContextMock.resolveActiveAgencyContext.mockResolvedValue(null);
    const result = await listSwitcherWorkspaces({ id: "user-1" });
    expect(result).toEqual({ options: [], isAdmin: false });
  });

  it("returns the member's active workspaces, isAdmin=false, for a non-admin", async () => {
    dbMock.state.memberRows = [
      { id: "ws-1", name: "Northstar Coffee", slug: "northstar" },
      { id: "ws-2", name: "Autumn Blend", slug: "autumn" },
    ];
    const result = await listSwitcherWorkspaces({ id: "user-1" });
    expect(result.isAdmin).toBe(false);
    expect(result.options.map((o) => o.slug)).toEqual(["northstar", "autumn"]);
  });

  it("returns the admin's full set with member rows first (deduped)", async () => {
    dbMock.state.memberRows = [{ id: "ws-1", name: "Northstar", slug: "northstar" }];
    dbMock.state.adminRows = [
      { id: "ws-1", name: "Northstar", slug: "northstar" }, // dup
      { id: "ws-2", name: "Autumn Blend", slug: "autumn" },
      { id: "ws-3", name: "Globex", slug: "globex" },
    ];
    policyMock.isAgencyAdmin.mockResolvedValue(true);
    const result = await listSwitcherWorkspaces({ id: "user-1" });
    expect(result.isAdmin).toBe(true);
    // Member first, then admin-only extras, no duplicates.
    expect(result.options.map((o) => o.id)).toEqual(["ws-1", "ws-2", "ws-3"]);
  });

  it("falls back to the first admin-only workspace when the admin has no memberships", async () => {
    dbMock.state.memberRows = [];
    dbMock.state.adminRows = [
      { id: "ws-9", name: "Brand X", slug: "brand-x" },
      { id: "ws-10", name: "Brand Y", slug: "brand-y" },
    ];
    policyMock.isAgencyAdmin.mockResolvedValue(true);
    const result = await listSwitcherWorkspaces({ id: "user-1" });
    expect(result.isAdmin).toBe(true);
    expect(result.options.map((o) => o.slug)).toEqual(["brand-x", "brand-y"]);
  });

  it("returns an empty list when there is an agency but no workspaces exist", async () => {
    dbMock.state.memberRows = [];
    dbMock.state.adminRows = [];
    const result = await listSwitcherWorkspaces({ id: "user-1" });
    expect(result.isAdmin).toBe(false);
    expect(result.options).toEqual([]);
  });

  /**
   * Regression: pre-fix, the member query joined workspaceMemberships
   * with workspaces but did NOT filter by `workspaces.agencyId`. A
   * non-admin with memberships in two agencies saw workspaces from
   * BOTH agencies when the switcher was rendered in either one (a
   * cross-tenant UI leak). The admin query was already correctly
   * scoped.
   *
   * The fix added `eq(workspaces.agencyId, agencyId)` to the member
   * query. This test pins the contract by asserting the captured
   * WHERE args for the first select include the active agency id
   * string (we serialize the AND-of-equalities expression by
   * inspecting its `queryChunks` — Drizzle's `and(...)` returns a
   * SQL fragment with one chunk per operand, and each chunk's
   * `queryChunks` array carries the column name and value).
   */
  it("scopes the member query to the active agency (cross-tenant leak fix)", async () => {
    agencyContextMock.resolveActiveAgencyContext.mockResolvedValue({
      agencyId: "agency-A",
      source: "cookie",
    });
    await listSwitcherWorkspaces({ id: "user-1" });
    // First WHERE is the member query, second is the admin query
    // (only when the actor is an agency admin). For a non-admin
    // only the member query runs.
    expect(dbMock.state.whereCalls.length).toBeGreaterThanOrEqual(1);
    // Drizzle's `and()` and `eq()` produce SQL fragments with a
    // `queryChunks` array. Walk the structure (the AST has
    // circular references through the column table, so a plain
    // JSON.stringify recurses forever; the replacer breaks the
    // cycle by skipping the `table` field).
    const memberWhere = dbMock.state.whereCalls[0]?.[0] as {
      queryChunks?: unknown[];
    };
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(memberWhere, (_key, value) => {
      if (value && typeof value === "object") {
        if (seen.has(value as object)) return "[Circular]";
        seen.add(value as object);
        // Drop the Drizzle table reference (the cycle source).
        if ((value as { table?: unknown }).table !== undefined) {
          const { table: _table, ...rest } = value as Record<string, unknown>;
          return rest;
        }
      }
      return value;
    });
    // The agency-scoped `eq(workspaces.agencyId, agencyId)` must
    // appear in the WHERE. The pre-fix WHERE only carried the
    // user-id / status filters — the missing `agencyId` predicate
    // is the cross-tenant leak we're pinning.
    expect(serialized).toContain("agency_id");
    expect(serialized).toContain("agency-A");
  });
});
