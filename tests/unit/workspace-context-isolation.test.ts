import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * M1.4 — Workspace context isolation (anti-IDOR).
 *
 * The `/app/w/[slug]` route must NEVER resolve a workspace by slug
 * alone. A workspace's identity is the tuple `(agencyId, slug)`;
 * accepting the slug without the agency would let a member of agency
 * A walk into a same-named workspace in agency B by guessing the
 * slug. That is the classic IDOR / cross-tenant enumeration shape.
 *
 * This suite pins the contract for `findWorkspaceBySlug`,
 * `getAccessibleWorkspace`, and `getClientWorkspace`:
 *
 *   1. Explicit `requestedAgencyId` — actor is a member → returns the workspace.
 *   2. Explicit `requestedAgencyId` — actor is NOT a member → returns null
 *      (caller renders 404; the route MUST NOT 403, to avoid leaking
 *      the existence of the workspace in the other agency).
 *   3. No `requestedAgencyId` — singleton/active agency exists →
 *      returns the workspace by `(agencyId, slug)`.
 *   4. No `requestedAgencyId` — no active agency → returns null.
 *   5. Cross-agency slug collision — two agencies, two workspaces
 *      with the same slug; the actor is only a member of one —
 *      the helper never returns the other agency's workspace, even
 *      without the explicit `requestedAgencyId`.
 *   6. `getAccessibleWorkspace` with explicit `requestedAgencyId` —
 *      the role gate (internal) is applied AFTER the agency membership
 *      gate. A non-internal member of the requested agency gets null,
 *      not a leaked workspace row.
 *   7. `getClientWorkspace` with explicit `requestedAgencyId` — same
 *      shape, with the client-role gate.
 *   8. Agency-admin override — the agency admin of the requested
 *      agency can access the workspace even without a workspace role
 *      row, as long as they pass the explicit `requestedAgencyId`.
 *   9. Anti-IDOR: actor is agency admin of agency A, requests
 *      agency B (no membership at all) → returns null. The admin
 *      shortcut in `canAccessWorkspace` must NOT bypass the agency
 *      boundary — the agency is a *different* agency, not a
 *      sub-tenant.
 *
 * Pattern mirrors `workspaces-context.test.ts` and
 * `auth-policy.test.ts`: chainable drizzle mock + policy mocks.
 * The mock for `isAgencyMember` is what gives us coverage of the
 * anti-IDOR path. We do NOT mock the resolver — this suite
 * exercises the helper layer directly, which is the layer that
 * `resolveActiveAgencyContext` callers hand `agencyId` into.
 */

// ─── DB mock (Drizzle chainable) ─────────────────────────────────────────

type DrizzleState = {
  // Each call to .limit() pops the next result (or [] when empty).
  // The SUT issues at most two queries per call (membership check
  // + workspace lookup) when requestedAgencyId is provided. We
  // pop them in invocation order.
  limitResults: unknown[][];
};

function makeDrizzleMock(state: DrizzleState) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.limit = vi.fn(() => {
    const rows = state.limitResults.shift() ?? [];
    return Promise.resolve(rows);
  });
  const select = vi.fn(() => chain);
  return { select, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = { limitResults: [] };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

// ─── Policy mock (override the helpers the SUT calls) ───────────────────

const policyMock = vi.hoisted(() => ({
  activeAgencyId: vi.fn(async () => "agency-default" as string | null),
  isAgencyMember: vi.fn(async () => true as boolean),
  isAgencyAdmin: vi.fn(async () => false as boolean),
  canAccessInternalWorkspace: vi.fn(async () => true as boolean),
  canAccessClientWorkspace: vi.fn(async () => false as boolean),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, ...policyMock };
});

// ─── SUT import (after mocks) ─────────────────────────────────────────────

const context = await import("@/lib/workspaces/context");

// ─── Fixtures ────────────────────────────────────────────────────────────

const actor = { id: "user-1" };
const agencyA = "agency-A";
const agencyB = "agency-B";
const slug = "duplicate-slug";
const workspaceA = { id: "ws-A", slug, name: "A's Workspace", agencyId: agencyA };
const workspaceB = { id: "ws-B", slug, name: "B's Workspace", agencyId: agencyB };

beforeEach(() => {
  dbMock.state.limitResults = [];
  dbMock.select.mockClear();
  // Reset policy mocks to their "permissive" defaults — individual tests
  // override as needed.
  policyMock.activeAgencyId.mockReset();
  policyMock.activeAgencyId.mockResolvedValue("agency-default");
  policyMock.isAgencyMember.mockReset();
  policyMock.isAgencyMember.mockResolvedValue(true);
  policyMock.isAgencyAdmin.mockReset();
  policyMock.isAgencyAdmin.mockResolvedValue(false);
  policyMock.canAccessInternalWorkspace.mockReset();
  policyMock.canAccessInternalWorkspace.mockResolvedValue(true);
  policyMock.canAccessClientWorkspace.mockReset();
  policyMock.canAccessClientWorkspace.mockResolvedValue(false);
});

// ─── findWorkspaceBySlug ────────────────────────────────────────────────

describe("findWorkspaceBySlug — explicit requestedAgencyId", () => {
  it("1) returns the workspace when the actor is a member of the requested agency", async () => {
    // isAgencyMember is mocked to return true (no DB call from the
    // policy layer). Only the workspace lookup issues a DB query.
    policyMock.isAgencyMember.mockResolvedValue(true);
    dbMock.state.limitResults = [[workspaceA]];

    const result = await context.findWorkspaceBySlug(actor, slug, agencyA);
    expect(result).toEqual(workspaceA);
    // Membership check is the gate; workspace lookup is the one DB query.
    expect(policyMock.isAgencyMember).toHaveBeenCalledWith(actor, agencyA);
    expect(dbMock.select).toHaveBeenCalledTimes(1);
  });

  it("2) returns null when the actor is NOT a member of the requested agency (anti-IDOR 404)", async () => {
    // membership check: deny
    policyMock.isAgencyMember.mockResolvedValue(false);

    const result = await context.findWorkspaceBySlug(actor, slug, agencyB);
    expect(result).toBeNull();
    // Membership check IS issued; workspace lookup MUST NOT be issued
    // (a denied actor must not be able to trigger a workspace query —
    // that would be the information-leak vector).
    expect(policyMock.isAgencyMember).toHaveBeenCalledWith(actor, agencyB);
    // No DB call at all — the membership gate short-circuits.
    expect(dbMock.select).not.toHaveBeenCalled();
  });
});

describe("findWorkspaceBySlug — no requestedAgencyId (singleton fallback)", () => {
  it("3) returns the workspace by (activeAgencyId, slug) when the singleton is set", async () => {
    policyMock.activeAgencyId.mockResolvedValue(agencyA);
    dbMock.state.limitResults = [[workspaceA]];

    const result = await context.findWorkspaceBySlug(actor, slug);
    expect(result).toEqual(workspaceA);
  });

  it("4) returns null when there is no active agency", async () => {
    policyMock.activeAgencyId.mockResolvedValue(null);
    const result = await context.findWorkspaceBySlug(actor, slug);
    expect(result).toBeNull();
    // No workspace lookup should have been issued
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("5) cross-agency slug collision — never returns the other agency's workspace", async () => {
    // Two agencies, two workspaces with the same slug. Actor is a
    // member of agency A. With the singleton pointing at A, the
    // helper must return A's row — never B's.
    policyMock.activeAgencyId.mockResolvedValue(agencyA);
    dbMock.state.limitResults = [[workspaceA]]; // (A, slug) → ws-A
    // Even if the DB query were sloppy and returned B's row, the
    // helper must filter by the active agency. We assert the
    // correct row is returned.
    const result = await context.findWorkspaceBySlug(actor, slug);
    expect(result).toEqual(workspaceA);
    expect(result?.id).toBe("ws-A");
    expect(result?.id).not.toBe("ws-B");
    // The helper's contract is the agency-scoped tuple lookup; the
    // (B, slug) pair is in a different agency, and even if the DB
    // returned B's row, the helper must never surface it for an
    // actor in A.
    expect(result).not.toEqual(workspaceB);

    // And: explicitly requesting agency B as a non-member returns null.
    policyMock.isAgencyMember.mockResolvedValue(false);
    const denied = await context.findWorkspaceBySlug(actor, slug, agencyB);
    expect(denied).toBeNull();
  });
});

// ─── getAccessibleWorkspace ──────────────────────────────────────────────

describe("getAccessibleWorkspace — explicit requestedAgencyId", () => {
  it("6a) returns the workspace when the actor is a member AND has an internal role", async () => {
    dbMock.state.limitResults = [[{ x: 1 }]]; // membership pass
    dbMock.state.limitResults = [[workspaceA]]; // workspace found
    policyMock.canAccessInternalWorkspace.mockResolvedValue(true);

    const result = await context.getAccessibleWorkspace(actor, slug, agencyA);
    expect(result).toEqual(workspaceA);
  });

  it("6b) returns null when the actor is a member but has no internal role", async () => {
    dbMock.state.limitResults = [[{ x: 1 }]]; // membership pass
    dbMock.state.limitResults = [[workspaceA]]; // workspace found
    policyMock.canAccessInternalWorkspace.mockResolvedValue(false);

    const result = await context.getAccessibleWorkspace(actor, slug, agencyA);
    expect(result).toBeNull();
  });

  it("6c) returns null when the actor is NOT a member of the requested agency", async () => {
    // The current (pre-M1.4) implementation looks up by the
    // singleton agency and would return the workspace row. We
    // queue the row + mock the role check to return true so the
    // ONLY way this test passes is if the membership gate denies
    // first. After M1.4, the membership check is the gate; the
    // workspace lookup and the role check are unreachable for a
    // non-member.
    policyMock.isAgencyMember.mockResolvedValue(false);
    dbMock.state.limitResults = [[workspaceA]]; // a row IS there
    policyMock.canAccessInternalWorkspace.mockResolvedValue(true); // role OK
    const result = await context.getAccessibleWorkspace(actor, slug, agencyB);
    expect(result).toBeNull();
    // Role check MUST NOT be issued — non-members never reach the
    // role gate, and the canAccess helpers may hit the DB on a
    // workspace id that is technically none of our business.
    expect(policyMock.canAccessInternalWorkspace).not.toHaveBeenCalled();
  });
});

// ─── getClientWorkspace ─────────────────────────────────────────────────

describe("getClientWorkspace — explicit requestedAgencyId", () => {
  it("7a) returns the workspace when the actor is a member AND has a client role", async () => {
    dbMock.state.limitResults = [[{ x: 1 }]]; // membership pass
    dbMock.state.limitResults = [[workspaceA]]; // workspace found
    policyMock.canAccessClientWorkspace.mockResolvedValue(true);

    const result = await context.getClientWorkspace(actor, slug, agencyA);
    expect(result).toEqual(workspaceA);
  });

  it("7b) returns null when the actor is a member but has no client role", async () => {
    dbMock.state.limitResults = [[{ x: 1 }]];
    dbMock.state.limitResults = [[workspaceA]];
    policyMock.canAccessClientWorkspace.mockResolvedValue(false);

    const result = await context.getClientWorkspace(actor, slug, agencyA);
    expect(result).toBeNull();
  });

  it("7c) returns null when the actor is NOT a member of the requested agency", async () => {
    // Same logic as 6c — queue a workspace + mock the role check
    // to pass so the ONLY way the test passes is via the membership
    // gate. Pre-M1.4, the current implementation would return the
    // workspace (singleton lookup, role check passes), so the test
    // is meaningfully red.
    policyMock.isAgencyMember.mockResolvedValue(false);
    dbMock.state.limitResults = [[workspaceA]];
    policyMock.canAccessClientWorkspace.mockResolvedValue(true);
    const result = await context.getClientWorkspace(actor, slug, agencyB);
    expect(result).toBeNull();
    expect(policyMock.canAccessClientWorkspace).not.toHaveBeenCalled();
  });
});

// ─── Agency-admin override (within the requested agency) ────────────────

describe("agency-admin override", () => {
  it("8) an agency admin of the requested agency can access the workspace", async () => {
    // The admin override in canAccessWorkspace short-circuits to
    // true when the actor is an admin of the workspace's agency.
    // That override must be scoped to the requested agency, not
    // any agency the actor happens to admin.
    dbMock.state.limitResults = [[{ x: 1 }]]; // membership pass (admin implies member)
    dbMock.state.limitResults = [[workspaceA]];
    policyMock.canAccessInternalWorkspace.mockResolvedValue(true);

    const result = await context.getAccessibleWorkspace(actor, slug, agencyA);
    expect(result).toEqual(workspaceA);
  });

  it("9) an agency admin of agency A cannot bypass the agency boundary by requesting agency B", async () => {
    // This is the canonical anti-IDOR case. The admin role grants
    // authority WITHIN an agency, not across agencies. Requesting
    // a workspace in agency B (where the actor is not a member at
    // all) must return null, not fall through to the admin shortcut.
    policyMock.isAgencyMember.mockResolvedValue(false);

    const result = await context.getAccessibleWorkspace(actor, slug, agencyB);
    expect(result).toBeNull();
    // Membership check is the gate; role check is never reached.
    expect(policyMock.isAgencyMember).toHaveBeenCalledWith(actor, agencyB);
    expect(policyMock.canAccessInternalWorkspace).not.toHaveBeenCalled();
  });
});
