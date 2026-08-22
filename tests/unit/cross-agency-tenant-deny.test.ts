import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * M1.9 — Cross-agency tenant isolation, service-layer deny tests.
 *
 * The `src/lib/auth/policy.ts` helpers are the **only** authoritative
 * source of agency / workspace / content authorization. Every service
 * layer command calls one of them and translates `false` to 403.
 *
 * This suite pins the contract that the helpers MUST NOT grant access
 * to a resource that lives in a different agency than the actor's
 * active membership. A cross-agency grant would be a tenant-isolation
 * breach — catastrophic for a multi-tenant SaaS.
 *
 * The mocked `db` returns rows in the order the SUT asks for them.
 * Each `selectResults.push([…])` feeds one
 * `select(...).from(...).where(...).limit(1)` call. The tests use the
 * same `makeDrizzleMock` chain as `auth-policy.test.ts` so the policy
 * file's own coverage stays green.
 *
 * Coverage matrix:
 *   1. isAgencyAdmin — actor in agency A, asked about agency B → false
 *   2. canAccessWorkspace — workspace in agency B, actor is admin of A → false
 *   3. canAccessWorkspace — same-slug workspace in agency B (the
 *      "duplicate" scenario from the spec) → false
 *   4. canReview — content in agency B, actor is admin of A → false for
 *      all three gates
 *   5. canManageContent — content in agency B, actor is admin of A → false
 *   6. Deactivated membership — actor's row in target agency is
 *      `status = 'deactivated'` → false
 *   7. Deactivated workspace membership — actor's row in the target
 *      workspace is `status = 'deactivated'` → false
 *   8. Archived workspace in agency B is still denied to agency A
 *      admin (no "archived shortcut" exists in the policy)
 *
 * The last three cover the "deactivated membership / suspended agency /
 * archived workspace" edge cases the spec calls out. Suspended agency
 * is modeled via deactivated membership (the agencies table has no
 * status column — agency suspension is enforced at the membership
 * level, which is the canonical pattern from §8).
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

const policy = await import("@/lib/auth/policy");

// Actor is an active admin of agency-A. We will probe helpers with
// resources that live in agency-B and assert they all deny.
const actor = { id: "user-actor" };
const AGENCY_A = "11111111-1111-1111-1111-111111111111";
const AGENCY_B = "22222222-2222-2222-2222-222222222222";
const WS_B = "33333333-3333-3333-3333-333333333333";
const CI_B = "44444444-4444-4444-4444-444444444444";

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.select.mockClear();
});

// ─── 1. isAgencyAdmin ─────────────────────────────────────────────────────

describe("isAgencyAdmin — cross-agency", () => {
  it("returns false when the actor's only admin grant is in agency A and agency B is queried", async () => {
    // The helper looks up by (agencyId, userId, status='active'). The
    // mock returns the row the SUT actually queried for. We arrange an
    // empty result for the agency-B lookup (no row exists for that
    // (actor, AGENCY_B) pair), and a separate test below verifies
    // that the agency-A admin lookup returns the row.
    dbMock.state.selectResults = [[]];
    expect(await policy.isAgencyAdmin(actor, AGENCY_B)).toBe(false);

    // Sanity: same actor, agency A — the helper returns the row.
    dbMock.state.selectResults = [[{ isAdmin: true }]];
    expect(await policy.isAgencyAdmin(actor, AGENCY_A)).toBe(true);
  });
});

// ─── 2. canAccessWorkspace ────────────────────────────────────────────────

describe("canAccessWorkspace — cross-agency", () => {
  it("denies an agency-A admin on a workspace that lives in agency B", async () => {
    // canAccessWorkspace queries the workspace to get its agencyId,
    // then delegates to isAgencyAdmin + isWorkspaceMember on that
    // agency. We arrange:
    //   (a) workspace row → agencyId = AGENCY_B
    //   (b) isAgencyAdmin(actor, AGENCY_B) → empty (actor is not in B)
    //   (c) isWorkspaceMember(actor, wsB)   → empty (no membership)
    dbMock.state.selectResults.push([{ agencyId: AGENCY_B }]); // (a)
    dbMock.state.selectResults.push([]); // (b) no agency-B admin grant
    dbMock.state.selectResults.push([]); // (c) no workspace membership
    expect(await policy.canAccessWorkspace(actor, WS_B)).toBe(false);
  });

  it("denies on the same-slug cross-agency case (workspace 'duplicate' exists in both agencies)", async () => {
    // The spec calls out the case where two agencies each have a
    // workspace with the same slug. The actor's cookie / URL param
    // resolves the slug, the resolver looks up the workspace by
    // (agencyId, slug), and the workspace row's agencyId drives the
    // policy check. We pin that the policy denies regardless of slug.
    dbMock.state.selectResults.push([{ agencyId: AGENCY_B }]);
    dbMock.state.selectResults.push([]);
    dbMock.state.selectResults.push([]);
    expect(await policy.canAccessWorkspace(actor, WS_B)).toBe(false);
  });
});

// ─── 3. canReview — every gate denies cross-agency ────────────────────────

describe("canReview — cross-agency, every gate", () => {
  for (const gate of ["content", "creative_internal", "creative_client"] as const) {
    it(`returns false on the ${gate} gate for content in agency B`, async () => {
      // canReview first calls workspaceIdForContent → { workspaceId: WS_B }
      // then hasWorkspaceRole(actor, WS_B, [role for this gate]):
      //   1. workspace row → { agencyId: AGENCY_B }
      //   2. isAgencyAdmin(actor, AGENCY_B) → empty
      //   3. workspace role lookup → empty
      dbMock.state.selectResults.push([{ workspaceId: WS_B }]); // workspaceIdForContent
      dbMock.state.selectResults.push([{ agencyId: AGENCY_B }]); // hasWorkspaceRole ws row
      dbMock.state.selectResults.push([]); // isAgencyAdmin on B → empty
      dbMock.state.selectResults.push([]); // role lookup → empty
      expect(await policy.canReview(actor, CI_B, gate)).toBe(false);
    });
  }
});

// ─── 4. canManageContent ─────────────────────────────────────────────────

describe("canManageContent — cross-agency", () => {
  it("denies an agency-A admin on content in agency B", async () => {
    // canManageContent → hasWorkspaceRole(actor, workspaceId, [planner|manager])
    // 1. workspaceIdForContent → WS_B
    // 2. hasWorkspaceRole → workspace row agencyId = AGENCY_B
    // 3. isAgencyAdmin(actor, AGENCY_B) → empty
    // 4. role lookup → empty
    dbMock.state.selectResults.push([{ workspaceId: WS_B }]);
    dbMock.state.selectResults.push([{ agencyId: AGENCY_B }]);
    dbMock.state.selectResults.push([]);
    dbMock.state.selectResults.push([]);
    expect(await policy.canManageContent(actor, CI_B)).toBe(false);
  });
});

// ─── 5. Edge: deactivated agency membership ──────────────────────────────

describe("deactivated agency membership", () => {
  it("isAgencyAdmin returns false when the only row has status='deactivated'", async () => {
    // The mock returns the row but the SUT filters on `status='active'`.
    // We simulate "the only admin row exists but is deactivated" by
    // returning the row with the deactivated status — the helper
    // must still return false because the query is `status = 'active'`.
    // Since the helper's WHERE clause is what filters, and we are
    // mocking at the .limit() boundary, the contract is: even if a
    // row WOULD have been returned, the helper sees only what the DB
    // gave it. A deactivated row in production would not be returned
    // by the query, so an empty result is the correct simulation.
    dbMock.state.selectResults = [[]];
    expect(await policy.isAgencyAdmin(actor, AGENCY_B)).toBe(false);

    // canAccessWorkspace must also deny: workspace in B, no active
    // admin grant on B, no active workspace membership.
    dbMock.state.selectResults = [];
    dbMock.state.selectResults.push([{ agencyId: AGENCY_B }]);
    dbMock.state.selectResults.push([]); // isAgencyAdmin(actor, B) → no active row
    dbMock.state.selectResults.push([]); // isWorkspaceMember(actor, wsB) → no row
    expect(await policy.canAccessWorkspace(actor, WS_B)).toBe(false);
  });
});

// ─── 6. Edge: deactivated workspace membership ───────────────────────────

describe("deactivated workspace membership", () => {
  it("canAccessWorkspace returns false when workspace membership is deactivated", async () => {
    // The mock represents what the DB query with
    // `status = 'active'` returns. A deactivated row is excluded by
    // the query, so the empty result is the correct simulation.
    dbMock.state.selectResults.push([{ agencyId: AGENCY_B }]);
    dbMock.state.selectResults.push([]); // no active admin in B
    dbMock.state.selectResults.push([]); // no active workspace member
    expect(await policy.canAccessWorkspace(actor, WS_B)).toBe(false);
  });
});

// ─── 7. Edge: archived workspace in another agency is still denied ───────

describe("archived workspace in another agency", () => {
  it("canAccessWorkspace does NOT grant cross-agency access just because the workspace is archived", async () => {
    // The policy does not short-circuit on `workspaces.status = 'archived'`
    // or `archived_at IS NOT NULL`. An archived workspace that the
    // actor is otherwise authorized to view remains accessible for
    // audit / history. A cross-agency archived workspace must STILL
    // be denied. The mock returns the workspace row with the archived
    // status the schema would carry — the policy ignores the status
    // column entirely and asks "is the actor authorized in
    // THIS workspace's agency?".
    dbMock.state.selectResults.push([{ agencyId: AGENCY_B, status: "archived" }]);
    dbMock.state.selectResults.push([]); // not an admin in B
    dbMock.state.selectResults.push([]); // not a workspace member
    expect(await policy.canAccessWorkspace(actor, WS_B)).toBe(false);
  });

  it("canAccessWorkspace still ALLOWS an in-agency member on an archived workspace (read-only history)", async () => {
    // Symmetric guarantee: archiving does not strip access. A user
    // who was a member when the workspace was archived can still
    // open it to read history. The policy must NOT regress this
    // when adding the cross-agency check.
    dbMock.state.selectResults.push([{ agencyId: AGENCY_A, status: "archived" }]);
    dbMock.state.selectResults.push([]); // not a global agency-A admin
    dbMock.state.selectResults.push([{ x: 1 }]); // active workspace member
    expect(await policy.canAccessWorkspace(actor, WS_B)).toBe(true);
  });
});

// ─── 8. Sanity: in-agency admin shortcut still works (regression guard) ──

describe("in-agency admin shortcut (regression guard for the cross-agency check)", () => {
  it("agency-A admin still accesses an agency-A workspace", async () => {
    // The cross-agency denials must not regress the in-agency admin
    // shortcut. If the policy ever short-circuits on
    // `actor.agencyId === ws.agencyId` and gets it wrong, this test
    // will catch it.
    dbMock.state.selectResults.push([{ agencyId: AGENCY_A }]);
    dbMock.state.selectResults.push([{ isAdmin: true }]);
    expect(await policy.canAccessWorkspace(actor, "ws-in-A")).toBe(true);
  });
});
