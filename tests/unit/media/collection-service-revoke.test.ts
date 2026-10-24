import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Revoking a public media share collection must be scoped to the
 * collection's OWN workspace.
 *
 * The gate used to accept any active member of the agency, so a
 * read-only `viewer` in workspace B could tear down the client-facing
 * share link a `workspace_manager` in workspace A had published. The
 * creator and the agency admin keep their access; everyone else needs
 * write capability in the collection's workspace.
 */

type DrizzleState = {
  selectResults: unknown[][];
  updateCalls: { set: unknown; where: unknown }[];
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
    chain.set = vi.fn(() => chain);
    chain.returning = vi.fn(() => Promise.resolve([]));
    return chain;
  }
  const chain = makeChain();
  const select = vi.fn(() => chain);
  const update = vi.fn(() => chain);
  return { select, update, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = { selectResults: [], updateCalls: [] };
  return makeDrizzleMock(state);
});

vi.mock("@/lib/db", () => ({ db: dbMock }));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(async () => false as boolean),
  canWriteToWorkspace: vi.fn(async () => false as boolean),
  isAgencyAdmin: vi.fn(async () => false as boolean),
  isAgencyMember: vi.fn(async () => false as boolean),
}));

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return { ...actual, ...policyMock };
});

vi.mock("@/lib/media/errors", () => ({
  MediaPermissionError: class MediaPermissionError extends Error {
    constructor(message = "media_permission_denied") {
      super(message);
      this.name = "MediaPermissionError";
    }
  },
}));
vi.mock("@/lib/media/asset-access.server", () => ({ mediaAssetForActor: vi.fn() }));

const { revokeMediaShareCollection } = await import("@/lib/media/collection-service");

const actor = { id: "user-1" };
const otherUser = { id: "user-2" };

function pushCollection(row: Record<string, unknown>) {
  dbMock.state.selectResults.push([row]);
}

beforeEach(() => {
  dbMock.state.selectResults = [];
  dbMock.state.updateCalls = [];
  policyMock.hasWorkspaceRole.mockReset();
  policyMock.hasWorkspaceRole.mockResolvedValue(false);
  policyMock.canWriteToWorkspace.mockReset();
  policyMock.canWriteToWorkspace.mockResolvedValue(false);
  policyMock.isAgencyAdmin.mockReset();
  policyMock.isAgencyAdmin.mockResolvedValue(false);
  policyMock.isAgencyMember.mockReset();
  policyMock.isAgencyMember.mockResolvedValue(false);
});

describe("revokeMediaShareCollection", () => {
  it("refuses a viewer who is only an agency member", async () => {
    // The defect: `isAgencyMember` was enough to revoke ANY
    // collection in the agency, including one published by another
    // workspace's manager.
    pushCollection({
      id: "col-1",
      agencyId: "agency-1",
      workspaceId: "ws-a",
      createdBy: "someone-else",
    });
    policyMock.isAgencyMember.mockResolvedValue(true);
    await expect(revokeMediaShareCollection(otherUser, "col-1")).rejects.toThrow(
      /media_permission_denied/,
    );
  });

  it("scopes the check to the collection's own workspace", async () => {
    pushCollection({
      id: "col-1",
      agencyId: "agency-1",
      workspaceId: "ws-a",
      createdBy: "someone-else",
    });
    policyMock.canWriteToWorkspace.mockResolvedValue(false);
    await expect(revokeMediaShareCollection(otherUser, "col-1")).rejects.toThrow(
      /media_permission_denied/,
    );
    expect(policyMock.canWriteToWorkspace).toHaveBeenCalledWith(otherUser, "ws-a");
  });

  it("allows a write-capable member of the collection's workspace", async () => {
    pushCollection({
      id: "col-1",
      agencyId: "agency-1",
      workspaceId: "ws-a",
      createdBy: "someone-else",
    });
    policyMock.canWriteToWorkspace.mockResolvedValue(true);
    await revokeMediaShareCollection(otherUser, "col-1");
    expect(policyMock.canWriteToWorkspace).toHaveBeenCalledWith(otherUser, "ws-a");
  });

  it("allows the creator regardless of their role", async () => {
    pushCollection({
      id: "col-1",
      agencyId: "agency-1",
      workspaceId: "ws-a",
      createdBy: actor.id,
    });
    await revokeMediaShareCollection(actor, "col-1");
    // The creator path must not need a workspace role at all.
    expect(policyMock.canWriteToWorkspace).not.toHaveBeenCalled();
  });

  it("allows the agency admin regardless of workspace role", async () => {
    pushCollection({
      id: "col-1",
      agencyId: "agency-1",
      workspaceId: "ws-a",
      createdBy: "someone-else",
    });
    policyMock.isAgencyAdmin.mockResolvedValue(true);
    await revokeMediaShareCollection(otherUser, "col-1");
    expect(policyMock.isAgencyAdmin).toHaveBeenCalledWith(otherUser, "agency-1");
  });

  it("returns { revoked: false } for a collection that does not exist", async () => {
    // an empty result set (not a row holding an empty array)
    dbMock.state.selectResults.push([]);
    const result = await revokeMediaShareCollection(actor, "missing");
    expect(result).toEqual({ revoked: false });
  });
});
