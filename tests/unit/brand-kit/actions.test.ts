import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The brand-kit server actions are a thin wrapper around the auth +
 * policy + db chain. We mock all three layers and assert that:
 *   - the action rejects unauthenticated callers;
 *   - it rejects non-workspace members;
 *   - it rejects non-`workspace_manager` members;
 *   - it accepts a valid payload and forwards it to `db.insert` /
 *     `revalidatePath`;
 *   - it returns the first Zod issue as a friendly error message.
 *
 * `next/cache` is already stubbed in `tests/setup.ts` to a no-op
 * `revalidatePath`, so we just assert the action completes (not
 * crash) and that the stub was callable.
 */

type DrizzleState = {
  insertCalls: { values: unknown }[];
  updateCalls: { set: unknown; where: unknown }[];
  deleteCalls: { where: unknown }[];
};

function makeDrizzleMock(state: DrizzleState) {
  const insertChain: Record<string, unknown> = {};
  insertChain.values = vi.fn((values: unknown) => {
    state.insertCalls.push({ values });
    return Promise.resolve();
  });
  const insert = vi.fn(() => insertChain);

  const updateChain: Record<string, unknown> = {};
  let lastSet: unknown = undefined;
  updateChain.set = vi.fn((set: unknown) => {
    lastSet = set;
    return updateChain;
  });
  updateChain.where = vi.fn((where: unknown) => {
    state.updateCalls.push({ set: lastSet, where });
    lastSet = undefined;
    return Promise.resolve();
  });
  const update = vi.fn(() => updateChain);

  const deleteChain: Record<string, unknown> = {};
  deleteChain.where = vi.fn((where: unknown) => {
    state.deleteCalls.push({ where });
    return Promise.resolve();
  });
  const del = vi.fn(() => deleteChain);

  return { insert, update, delete: del, state };
}

const dbMock = vi.hoisted(() => {
  const state: DrizzleState = { insertCalls: [], updateCalls: [], deleteCalls: [] };
  return makeDrizzleMock(state);
});

const authMock = vi.hoisted(() => ({
  auth: vi.fn(),
}));

const workspaceMock = vi.hoisted(() => ({
  getAccessibleWorkspace: vi.fn(),
}));

const policyMock = vi.hoisted(() => ({
  hasWorkspaceRole: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/auth/config", () => ({ auth: authMock.auth }));
vi.mock("@/lib/workspaces/context", () => workspaceMock);
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: policyMock.hasWorkspaceRole }));

const {
  createColorAssetAction,
  archiveColorAssetAction,
  createLogoAssetAction,
  archiveLogoAssetAction,
  createVoiceRuleAction,
  archiveVoiceRuleAction,
} = await import("@/app/(app)/app/w/[slug]/brand-kit/actions");

const slug = "test-slug";
const workspace = { id: "ws-1", slug, name: "Test" };
const session = { user: { id: "user-1" } };

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  dbMock.state.insertCalls = [];
  dbMock.state.updateCalls = [];
  dbMock.state.deleteCalls = [];
  authMock.auth.mockReset();
  workspaceMock.getAccessibleWorkspace.mockReset();
  policyMock.hasWorkspaceRole.mockReset();
});

describe("createColorAssetAction", () => {
  it("rejects an unauthenticated caller", async () => {
    authMock.auth.mockResolvedValue(null);
    const result = await createColorAssetAction(
      slug,
      {},
      formData({ name: "Brand blue", hex: "#3B82F6" }),
    );
    expect(result).toEqual({ error: "Sign in is required." });
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("rejects a session without a user id", async () => {
    authMock.auth.mockResolvedValue({ user: {} });
    const result = await createColorAssetAction(
      slug,
      {},
      formData({ name: "Brand blue", hex: "#3B82F6" }),
    );
    expect(result).toEqual({ error: "Sign in is required." });
  });

  it("rejects a caller with no accessible workspace", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(null);
    const result = await createColorAssetAction(
      slug,
      {},
      formData({ name: "Brand blue", hex: "#3B82F6" }),
    );
    expect(result).toEqual({ error: "Workspace not found." });
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("rejects a caller without workspace_manager role", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    const result = await createColorAssetAction(
      slug,
      {},
      formData({ name: "Brand blue", hex: "#3B82F6" }),
    );
    expect(result).toEqual({ error: "Workspace manager access is required." });
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("returns a Zod issue when the hex is malformed", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createColorAssetAction(
      slug,
      {},
      formData({ name: "Brand blue", hex: "3B82F6" }),
    );
    expect(result.error).toMatch(/RRGGBB/);
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("inserts a color asset and calls revalidatePath on success", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createColorAssetAction(
      slug,
      {},
      formData({ name: "Brand blue", hex: "#3B82F6" }),
    );
    expect(result).toEqual({ success: true });
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      workspaceId: workspace.id,
      createdBy: session.user.id,
      kind: "color",
      name: "Brand blue",
      value: { hex: "#3B82F6" },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});

describe("archiveColorAssetAction", () => {
  it("returns silently when there is no session", async () => {
    authMock.auth.mockResolvedValue(null);
    await archiveColorAssetAction(slug, "asset-1");
    expect(dbMock.state.updateCalls).toHaveLength(0);
  });

  it("updates the row with archivedAt when the caller is a workspace_manager", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveColorAssetAction(slug, "asset-1");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({ archivedAt: expect.any(Date) });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});

describe("createVoiceRuleAction", () => {
  it("returns the first Zod issue when the content is too long", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createVoiceRuleAction(
      slug,
      {},
      formData({ ruleType: "tone", content: "x".repeat(61) }),
    );
    expect(result.error).toBeDefined();
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("inserts a voice rule on success and revalidates the page", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createVoiceRuleAction(
      slug,
      {},
      formData({ ruleType: "do", content: "Lead with outcomes." }),
    );
    expect(result).toEqual({ success: true });
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      workspaceId: workspace.id,
      createdBy: session.user.id,
      ruleType: "do",
      content: "Lead with outcomes.",
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});

describe("archiveVoiceRuleAction", () => {
  it("deletes the row when the caller is a workspace_manager (no archivedAt column)", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveVoiceRuleAction(slug, "rule-1");
    expect(dbMock.state.deleteCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});

describe("createLogoAssetAction", () => {
  it("inserts a logo asset with storagePath and revalidates the page", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createLogoAssetAction(
      slug,
      {},
      formData({ name: "Wordmark", storagePath: "ws-1/abc-123.png" }),
    );
    expect(result).toEqual({ success: true });
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      workspaceId: workspace.id,
      createdBy: session.user.id,
      kind: "logo",
      name: "Wordmark",
      storagePath: "ws-1/abc-123.png",
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });

  it("rejects when the caller is not a workspace_manager", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    const result = await createLogoAssetAction(
      slug,
      {},
      formData({ name: "Wordmark", storagePath: "ws-1/abc-123.png" }),
    );
    expect(result).toEqual({ error: "Workspace manager access is required." });
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("rejects when both externalUrl and storagePath are provided", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createLogoAssetAction(
      slug,
      {},
      formData({
        name: "Wordmark",
        externalUrl: "https://cdn.example.com/logo.svg",
        storagePath: "ws-1/abc-123.png",
      }),
    );
    expect(result.error).toMatch(/Pick one/);
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("rejects an empty name", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createLogoAssetAction(
      slug,
      {},
      formData({ name: "", storagePath: "ws-1/abc-123.png" }),
    );
    expect(result.error).toBeDefined();
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });
});

describe("archiveLogoAssetAction", () => {
  it("updates the row with archivedAt when the caller is a workspace_manager", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveLogoAssetAction(slug, "logo-1");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({ archivedAt: expect.any(Date) });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });

  it("returns silently when there is no session", async () => {
    authMock.auth.mockResolvedValue(null);
    await archiveLogoAssetAction(slug, "logo-1");
    expect(dbMock.state.updateCalls).toHaveLength(0);
  });
});
