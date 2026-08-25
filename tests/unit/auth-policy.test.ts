import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Policy helpers exercise a lot of branching:
 *   - agency-admin shortcut
 *   - workspace role check (internal vs client)
 *   - content-level permission
 *   - review gate role mapping
 *   - the "demote yourself" / "manage member" guards
 *
 * We mock `db` with a chainable select that returns rows the SUT
 * configured via `.where()`. Branch coverage is the goal — we don't try
 * to assert SQL shape (that's an integration concern).
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

const policy = await import("@/lib/auth/policy");

const actor = { id: "user-1" };
const otherActor = { id: "user-2" };

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.select.mockClear();
});

describe("isAgencyAdmin", () => {
  it("returns true when the active agency membership has isAgencyAdmin=true", async () => {
    dbMock.state.selectResults = [[{ isAdmin: true }]];
    expect(await policy.isAgencyAdmin(actor, "agency-1")).toBe(true);
  });

  it("returns false when the row is missing", async () => {
    dbMock.state.selectResults = [[]];
    expect(await policy.isAgencyAdmin(actor, "agency-1")).toBe(false);
  });

  it("returns false when isAdmin is explicitly false", async () => {
    dbMock.state.selectResults = [[{ isAdmin: false }]];
    expect(await policy.isAgencyAdmin(actor, "agency-1")).toBe(false);
  });
});

describe("isAgencyMember", () => {
  it("returns true when the membership row exists", async () => {
    dbMock.state.selectResults = [[{ x: 1 }]];
    expect(await policy.isAgencyMember(actor, "agency-1")).toBe(true);
  });

  it("returns false when the membership row is missing", async () => {
    dbMock.state.selectResults = [[]];
    expect(await policy.isAgencyMember(actor, "agency-1")).toBe(false);
  });
});

describe("isWorkspaceMember", () => {
  it("returns true for an active workspace membership", async () => {
    dbMock.state.selectResults = [[{ x: 1 }]];
    expect(await policy.isWorkspaceMember(actor, "ws-1")).toBe(true);
  });

  it("returns false when no active membership", async () => {
    dbMock.state.selectResults = [[]];
    expect(await policy.isWorkspaceMember(actor, "ws-1")).toBe(false);
  });
});

describe("canAccessWorkspace", () => {
  it("returns false when the workspace is missing", async () => {
    dbMock.state.selectResults.push([]);
    expect(await policy.canAccessWorkspace(actor, "ws-missing")).toBe(false);
  });

  it("returns true for an agency admin even without a workspace membership", async () => {
    // First select: workspace row
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    // Second select: agency admin check returns true
    dbMock.state.selectResults.push([{ isAdmin: true }]);
    expect(await policy.canAccessWorkspace(actor, "ws-1")).toBe(true);
  });

  it("returns true for a workspace member", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ x: 1 }]);
    expect(await policy.canAccessWorkspace(actor, "ws-1")).toBe(true);
  });

  it("returns false for a non-member non-admin", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([]);
    expect(await policy.canAccessWorkspace(actor, "ws-1")).toBe(false);
  });
});

describe("canAccessInternalWorkspace / canAccessClientWorkspace", () => {
  it("canAccessInternalWorkspace delegates to hasWorkspaceRole with INTERNAL_WORKSPACE_ROLES", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]); // workspace row
    dbMock.state.selectResults.push([{ isAdmin: false }]); // isAgencyAdmin check
    dbMock.state.selectResults.push([{ role: "workspace_manager" }]); // role check

    expect(await policy.canAccessInternalWorkspace(actor, "ws-1")).toBe(true);
  });

  it("canAccessClientWorkspace delegates to hasWorkspaceRole with [client_reviewer]", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]); // workspace row
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "client_reviewer" }]);

    expect(await policy.canAccessClientWorkspace(actor, "ws-1")).toBe(true);
  });
});

describe("hasWorkspaceRole", () => {
  it("returns false when the workspace does not exist", async () => {
    dbMock.state.selectResults.push([]);
    expect(await policy.hasWorkspaceRole(actor, "ws-missing", ["workspace_manager"])).toBe(false);
  });

  it("short-circuits to true for agency admins", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: true }]);
    expect(await policy.hasWorkspaceRole(actor, "ws-1", ["workspace_manager"])).toBe(true);
  });

  it("returns true when the role row is found", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "workspace_manager" }]);
    expect(await policy.hasWorkspaceRole(actor, "ws-1", ["workspace_manager"])).toBe(true);
  });

  it("returns false when no role row matches", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([]);
    expect(await policy.hasWorkspaceRole(actor, "ws-1", ["workspace_manager"])).toBe(false);
  });
});

describe("getWorkspaceRoles", () => {
  it("returns an empty set when the workspace is missing", async () => {
    dbMock.state.selectResults.push([]); // workspace lookup returns nothing
    const result = await policy.getWorkspaceRoles(actor, "ws-missing");
    expect(result).toBeInstanceOf(Set);
    expect(result.size).toBe(0);
  });

  it("returns the full internal role set when the actor is an agency admin (no role-row select)", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: true }]);
    const before = dbMock.select.mock.calls.length;
    const result = await policy.getWorkspaceRoles(actor, "ws-1");
    const after = dbMock.select.mock.calls.length;
    // workspace lookup + agency-admin check; no role-row select.
    expect(after - before).toBe(2);
    expect(result.size).toBe(policy.INTERNAL_WORKSPACE_ROLES.length);
    for (const role of policy.INTERNAL_WORKSPACE_ROLES) {
      expect(result.has(role)).toBe(true);
    }
  });

  it("returns a Set of the actor's actual workspace roles (single role query)", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "workspace_manager" }, { role: "designer" }]);
    const before = dbMock.select.mock.calls.length;
    const result = await policy.getWorkspaceRoles(actor, "ws-1");
    const after = dbMock.select.mock.calls.length;
    expect(after - before).toBe(3); // workspace + admin + role query
    expect(result.size).toBe(2);
    expect(result.has("workspace_manager")).toBe(true);
    expect(result.has("designer")).toBe(true);
    expect(result.has("client_reviewer")).toBe(false);
  });

  it("returns an empty set when the actor holds no roles", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([]);
    const result = await policy.getWorkspaceRoles(actor, "ws-1");
    expect(result.size).toBe(0);
  });
});

describe("canViewContent", () => {
  it("returns false when the content item is missing", async () => {
    dbMock.state.selectResults.push([]);
    expect(await policy.canViewContent(actor, "missing")).toBe(false);
  });

  it("returns true for the workspace member", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ x: 1 }]);
    expect(await policy.canViewContent(actor, "ci-1")).toBe(true);
  });

  it("returns true for the agency admin", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: true }]);
    expect(await policy.canViewContent(actor, "ci-1")).toBe(true);
  });

  it("returns false for a non-member non-admin", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1", agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([]);
    expect(await policy.canViewContent(actor, "ci-1")).toBe(false);
  });
});

describe("canManageContent", () => {
  it("delegates to hasWorkspaceRole with planner-or-manager", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]); // workspaceIdForContent
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]); // hasWorkspaceRole workspace row
    dbMock.state.selectResults.push([{ isAdmin: true }]); // agency admin
    expect(await policy.canManageContent(actor, "ci-1")).toBe(true);
  });
});

describe("canReview", () => {
  it("returns true for an internal reviewer on the content gate", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "internal_reviewer" }]);
    expect(await policy.canReview(actor, "ci-1", "content")).toBe(true);
  });

  it("returns true for an internal reviewer on the creative_internal gate", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "internal_reviewer" }]);
    expect(await policy.canReview(actor, "ci-1", "creative_internal")).toBe(true);
  });

  it("returns true for a client_reviewer on the creative_client gate", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "client_reviewer" }]);
    expect(await policy.canReview(actor, "ci-1", "creative_client")).toBe(true);
  });

  it("returns false when no role matches", async () => {
    dbMock.state.selectResults.push([{ workspaceId: "ws-1" }]);
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([]);
    expect(await policy.canReview(actor, "ci-1", "content")).toBe(false);
  });
});

describe("firstAgencyForBootstrap", () => {
  it("returns the most-recently-created agency id when at least one exists", async () => {
    dbMock.state.selectResults.push([{ id: "agency-1" }]);
    expect(await policy.firstAgencyForBootstrap()).toBe("agency-1");
  });

  it("returns null when no agency exists", async () => {
    dbMock.state.selectResults.push([]);
    expect(await policy.firstAgencyForBootstrap()).toBeNull();
  });
});

describe("requirePolicy", () => {
  it("throws PermissionDeniedError when the predicate is false", async () => {
    await expect(
      policy.requirePolicy(Promise.resolve(false), "test_action"),
    ).rejects.toBeInstanceOf(policy.PermissionDeniedError);
  });

  it("resolves silently when the predicate is true", async () => {
    await expect(
      policy.requirePolicy(Promise.resolve(true), "test_action"),
    ).resolves.toBeUndefined();
  });
});

describe("PermissionDeniedError", () => {
  it("carries the action name in the message", () => {
    const err = new policy.PermissionDeniedError("update_content");
    expect(err.action).toBe("update_content");
    expect(err.message).toContain("update_content");
    expect(err.name).toBe("PermissionDeniedError");
  });
});

describe("canManageAgencyMember", () => {
  it("returns false when the actor is the target (self-edit guard)", async () => {
    expect(await policy.canManageAgencyMember(actor, actor.id, "agency-1")).toBe(false);
  });

  it("returns false when the actor is not an admin", async () => {
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    expect(await policy.canManageAgencyMember(actor, otherActor.id, "agency-1")).toBe(false);
  });

  it("returns false when the target is not an active member", async () => {
    dbMock.state.selectResults.push([{ isAdmin: true }]);
    dbMock.state.selectResults.push([]);
    expect(await policy.canManageAgencyMember(actor, otherActor.id, "agency-1")).toBe(false);
  });

  it("returns true for an active member of the same agency", async () => {
    dbMock.state.selectResults.push([{ isAdmin: true }]);
    dbMock.state.selectResults.push([{ x: 1 }]);
    expect(await policy.canManageAgencyMember(actor, otherActor.id, "agency-1")).toBe(true);
  });
});

describe("INTERNAL_WORKSPACE_ROLES", () => {
  it("is the canonical role list", () => {
    expect(policy.INTERNAL_WORKSPACE_ROLES).toEqual([
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
      "viewer",
    ]);
  });
});

describe("WRITE_CAPABLE_ROLES (FEAT-16)", () => {
  it("is INTERNAL_WORKSPACE_ROLES minus the read-only 'viewer' role", () => {
    expect([...policy.WRITE_CAPABLE_ROLES].sort()).toEqual(
      policy.INTERNAL_WORKSPACE_ROLES.filter((r) => r !== "viewer").sort(),
    );
  });

  it("does not include client_reviewer (client reviewers may only comment)", () => {
    expect(policy.WRITE_CAPABLE_ROLES).not.toContain("client_reviewer");
  });
});

describe("canWriteToWorkspace / requireWriteCapability (FEAT-16)", () => {
  it("returns true for a workspace_manager", async () => {
    // workspace lookup + admin check (false) + role row
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "workspace_manager" }]);
    expect(await policy.canWriteToWorkspace(actor, "ws-1")).toBe(true);
  });

  it("returns true for a designer (the other five WRITE_CAPABLE_ROLES also pass)", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "designer" }]);
    expect(await policy.canWriteToWorkspace(actor, "ws-1")).toBe(true);
  });

  it("returns false for a client_reviewer (read-only)", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "client_reviewer" }]);
    expect(await policy.canWriteToWorkspace(actor, "ws-1")).toBe(false);
  });

  it("returns false for a viewer (read-only)", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "viewer" }]);
    expect(await policy.canWriteToWorkspace(actor, "ws-1")).toBe(false);
  });

  it("returns true for an agency admin via the admin shortcut", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: true }]);
    expect(await policy.canWriteToWorkspace(actor, "ws-1")).toBe(true);
  });

  it("requireWriteCapability throws PermissionDeniedError for a read-only actor", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "client_reviewer" }]);
    await expect(policy.requireWriteCapability(actor, "ws-1", "upload_sign")).rejects.toBeInstanceOf(
      policy.PermissionDeniedError,
    );
  });

  it("requireWriteCapability resolves for a writer", async () => {
    dbMock.state.selectResults.push([{ agencyId: "agency-1" }]);
    dbMock.state.selectResults.push([{ isAdmin: false }]);
    dbMock.state.selectResults.push([{ role: "publisher" }]);
    await expect(
      policy.requireWriteCapability(actor, "ws-1", "ai_generate"),
    ).resolves.toBeUndefined();
  });
});
