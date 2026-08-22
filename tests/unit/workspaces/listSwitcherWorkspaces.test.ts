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
};

function makeDrizzleMock(state: DrizzleMockState) {
  let callCount = 0;
  const chain: Record<string, unknown> = {};
  // The chain is chainable in any order; the only terminator is `.limit()`.
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
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
  const state: DrizzleMockState = { memberRows: [], adminRows: [] };
  return makeDrizzleMock(state);
});
vi.mock("@/lib/db", () => ({ db: dbMock }));

// Stub the auth policy module. We re-mock per-test in beforeEach to
// return different values for `firstAgencyForBootstrap` / `isAgencyAdmin`.
const policyMock = vi.hoisted(() => ({
  firstAgencyForBootstrap: vi.fn(async () => "agency-1" as string | null),
  isAgencyAdmin: vi.fn(async () => false as boolean),
}));
vi.mock("@/lib/auth/policy", () => policyMock);

// --- import the SUT (AFTER mocks) ------------------------------------------

const { listSwitcherWorkspaces } = await import("@/lib/workspaces/context");

// --- tests ----------------------------------------------------------------

beforeEach(() => {
  dbMock.state.memberRows = [];
  dbMock.state.adminRows = [];
  policyMock.firstAgencyForBootstrap.mockReset();
  policyMock.isAgencyAdmin.mockReset();
  policyMock.firstAgencyForBootstrap.mockResolvedValue("agency-1");
  policyMock.isAgencyAdmin.mockResolvedValue(false);
});

describe("listSwitcherWorkspaces", () => {
  it("returns an empty list with isAdmin=false when the user has no active agency", async () => {
    policyMock.firstAgencyForBootstrap.mockResolvedValue(null);
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
});
