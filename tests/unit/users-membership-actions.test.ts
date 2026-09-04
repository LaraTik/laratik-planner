import { beforeEach, describe, expect, it, vi } from "vitest";

type SelectResult = unknown[];

const state = vi.hoisted(() => {
  const selectResults: SelectResult[] = [];
  const select = vi.fn(() => {
    const result = selectResults.shift() ?? [];
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.leftJoin = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.limit = vi.fn(() => Promise.resolve(result));
    chain.then = (
      resolve: (value: SelectResult) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject);
    return chain;
  });

  const insert = vi.fn(() => {
    const chain: Record<string, unknown> = {};
    chain.values = vi.fn(() => chain);
    chain.onConflictDoUpdate = vi.fn(() => chain);
    chain.returning = vi.fn(() => Promise.resolve([{ id: "membership-1" }]));
    return chain;
  });
  const deleteRows = vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) }));
  const update = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) }));
  const tx = { select, insert, delete: deleteRows, update, execute: vi.fn() };
  const db = {
    select,
    insert,
    delete: deleteRows,
    update,
    transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
  return { selectResults, select, insert, deleteRows, update, tx, db };
});

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
const actorMock = vi.hoisted(() => ({ currentActor: vi.fn() }));
const contextMock = vi.hoisted(() => ({ resolveActiveAgencyContext: vi.fn() }));
const policyMock = vi.hoisted(() => ({
  isAgencyAdmin: vi.fn(),
  hasWorkspaceRole: vi.fn(),
}));
const errorMock = vi.hoisted(() => ({ captureError: vi.fn() }));

vi.mock("@/lib/db", () => ({ db: state.db }));
vi.mock("@/lib/auth/config", () => ({ auth: authMock.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: actorMock.currentActor }));
vi.mock("@/lib/auth/agency-context", () => contextMock);
vi.mock("@/lib/auth/policy", () => ({
  isAgencyAdmin: policyMock.isAgencyAdmin,
  hasWorkspaceRole: policyMock.hasWorkspaceRole,
  PermissionDeniedError: class PermissionDeniedError extends Error {},
}));
vi.mock("@/lib/observability/sentry", () => ({ captureError: errorMock.captureError }));
vi.mock("@/lib/auth/invitations", () => ({
  createInvitation: vi.fn(),
  deactivateUser: vi.fn(),
  reactivateUser: vi.fn(),
  resendInvitation: vi.fn(),
  revokeInvitation: vi.fn(),
}));
vi.mock("@/lib/auth/user-creation", () => ({
  ActiveAgencyMemberError: class ActiveAgencyMemberError extends Error {},
  InvalidPasswordError: class InvalidPasswordError extends Error {},
  UserAlreadyExistsError: class UserAlreadyExistsError extends Error {},
  createUserDirectly: vi.fn(),
}));
vi.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimit: vi.fn(async () => ({ allowed: true })),
  rateLimitRuleFor: vi.fn(() => ({ windowSeconds: 60 })),
}));

const { toggleAgencyAdminAction, updateMemberRolesAction } =
  await import("@/app/(app)/app/users/actions");

function formData(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

beforeEach(() => {
  state.selectResults.length = 0;
  state.select.mockClear();
  state.insert.mockClear();
  state.deleteRows.mockClear();
  state.update.mockClear();
  state.db.transaction.mockClear();
  state.tx.execute.mockClear();
  authMock.auth.mockResolvedValue({ user: { id: "manager-1" } });
  actorMock.currentActor.mockResolvedValue({ id: "manager-1" });
  contextMock.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  policyMock.isAgencyAdmin.mockResolvedValue(false);
  policyMock.hasWorkspaceRole.mockResolvedValue(false);
  errorMock.captureError.mockClear();
});

describe("workspace team membership actions", () => {
  it("lets a workspace manager replace roles in only the current workspace", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    state.selectResults.push(
      [{ userId: "member-1" }],
      [{ id: "workspace-1" }],
      [{ isAgencyAdmin: false }],
    );

    const result = await updateMemberRolesAction(
      "member-1",
      {},
      formData({
        roleScopeWorkspaceId: "workspace-1",
        workspaceRoles: JSON.stringify([
          { workspaceId: "workspace-1", roles: ["designer", "publisher"] },
        ]),
      }),
    );

    expect(result).toEqual({ saved: true });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith({ id: "manager-1" }, "workspace-1", [
      "workspace_manager",
    ]);
  });

  it("rejects a workspace manager payload that tries to write another workspace", async () => {
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    state.selectResults.push([{ userId: "member-1" }], [{ id: "workspace-1" }]);

    const result = await updateMemberRolesAction(
      "member-1",
      {},
      formData({
        roleScopeWorkspaceId: "workspace-1",
        workspaceRoles: JSON.stringify([{ workspaceId: "workspace-2", roles: ["publisher"] }]),
      }),
    );

    expect(result).toEqual({ error: "Invalid workspace access selection." });
    expect(state.db.transaction).not.toHaveBeenCalled();
  });

  it("returns an inline error when the agency-admin update cannot be committed", async () => {
    policyMock.isAgencyAdmin.mockResolvedValue(true);
    state.selectResults.push([{ isAgencyAdmin: false }]);
    state.db.transaction.mockRejectedValueOnce(new Error("database unavailable"));

    const result = await toggleAgencyAdminAction("member-1", {}, formData({ isAgencyAdmin: "on" }));

    expect(result.error).toMatch(/couldn.t apply|try again/i);
    expect(errorMock.captureError).toHaveBeenCalledWith(
      "users.toggleAgencyAdmin",
      expect.any(Error),
    );
  });

  it("promotes a member through the agency-scoped membership flag", async () => {
    policyMock.isAgencyAdmin.mockResolvedValue(true);
    state.selectResults.push(
      [{ isAgencyAdmin: false }],
      [{ isAgencyAdmin: false }],
      [{ count: 1 }],
    );

    const result = await toggleAgencyAdminAction("member-1", {}, formData({ isAgencyAdmin: "on" }));

    expect(result).toEqual({ saved: true });
    expect(state.tx.execute).toHaveBeenCalledTimes(1);
    expect(state.update).toHaveBeenCalled();
  });

  it("refuses to demote the final active agency administrator", async () => {
    policyMock.isAgencyAdmin.mockResolvedValue(true);
    state.selectResults.push([{ isAgencyAdmin: true }], [{ isAgencyAdmin: true }], [{ count: 1 }]);

    const result = await toggleAgencyAdminAction(
      "member-1",
      {},
      formData({ isAgencyAdmin: "off" }),
    );

    expect(result).toEqual({
      error: "The final active agency administrator cannot be demoted",
    });
    expect(state.update).not.toHaveBeenCalled();
  });
});
