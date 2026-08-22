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

// Service mutator mocks — only the four new mutators (publishing
// rule + linked resource). All other service exports stay real so
// the existing logo/font/voice tests, which assert on
// `dbMock.state.insertCalls`, keep working unchanged. The real
// service mutators route through the mocked `@/lib/db` and
// `@/lib/auth/policy` modules above.
const serviceMock = vi.hoisted(() => ({
  createBrandPublishingRule: vi.fn(),
  archiveBrandPublishingRule: vi.fn(),
  createBrandLinkedResource: vi.fn(),
  archiveBrandLinkedResource: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/auth/config", () => ({ auth: authMock.auth }));
vi.mock("@/lib/workspaces/context", () => workspaceMock);
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: policyMock.hasWorkspaceRole }));
vi.mock("@/lib/brand/service", async () => {
  // Re-export the real service module so the existing actions
  // (logo/font/voice) keep their real `createLogoAsset` /
  // `createFontAsset` / `createBrandVoiceRule` / etc. exports.
  const actual = await vi.importActual<typeof import("@/lib/brand/service")>("@/lib/brand/service");
  return {
    ...actual,
    createBrandPublishingRule: serviceMock.createBrandPublishingRule,
    archiveBrandPublishingRule: serviceMock.archiveBrandPublishingRule,
    createBrandLinkedResource: serviceMock.createBrandLinkedResource,
    archiveBrandLinkedResource: serviceMock.archiveBrandLinkedResource,
  };
});

const {
  createColorAssetAction,
  archiveColorAssetAction,
  createLogoAssetAction,
  archiveLogoAssetAction,
  createFontAssetAction,
  archiveFontAssetAction,
  createVoiceRuleAction,
  archiveVoiceRuleAction,
  createPublishingRuleAction,
  archivePublishingRuleAction,
  createLinkedResourceAction,
  archiveLinkedResourceAction,
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
  serviceMock.createBrandPublishingRule.mockReset();
  serviceMock.createBrandPublishingRule.mockResolvedValue(undefined);
  serviceMock.archiveBrandPublishingRule.mockReset();
  serviceMock.archiveBrandPublishingRule.mockResolvedValue(undefined);
  serviceMock.createBrandLinkedResource.mockReset();
  serviceMock.createBrandLinkedResource.mockResolvedValue(undefined);
  serviceMock.archiveBrandLinkedResource.mockReset();
  serviceMock.archiveBrandLinkedResource.mockResolvedValue(undefined);
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

describe("createFontAssetAction", () => {
  it("inserts a font asset with family/weight/role in the value jsonb", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createFontAssetAction(
      slug,
      {},
      formData({ name: "Body", family: "Roboto", weight: "400", role: "body" }),
    );
    expect(result).toEqual({ success: true });
    expect(dbMock.state.insertCalls).toHaveLength(1);
    expect(dbMock.state.insertCalls[0]?.values).toMatchObject({
      workspaceId: workspace.id,
      createdBy: session.user.id,
      kind: "font",
      name: "Body",
      value: { family: "Roboto", weight: 400, role: "body" },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });

  it("rejects a non-integer weight (the action parses the form value as an int)", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createFontAssetAction(
      slug,
      {},
      formData({ name: "Body", family: "Inter", weight: "400.5", role: "body" }),
    );
    expect(result.error).toMatch(/whole number/);
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("rejects a weight that isn't a multiple of 100", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createFontAssetAction(
      slug,
      {},
      formData({ name: "Body", family: "Inter", weight: "425", role: "body" }),
    );
    expect(result.error).toMatch(/multiple of 100/);
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("rejects when the caller is not a workspace_manager", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    const result = await createFontAssetAction(
      slug,
      {},
      formData({ name: "Body", family: "Inter", weight: "400", role: "body" }),
    );
    expect(result).toEqual({ error: "Workspace manager access is required." });
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });

  it("rejects an unknown role", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createFontAssetAction(
      slug,
      {},
      formData({ name: "Body", family: "Inter", weight: "400", role: "footer" }),
    );
    expect(result.error).toBeDefined();
    expect(dbMock.state.insertCalls).toHaveLength(0);
  });
});

describe("archiveFontAssetAction", () => {
  it("updates the row with archivedAt when the caller is a workspace_manager", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveFontAssetAction(slug, "font-1");
    expect(dbMock.state.updateCalls).toHaveLength(1);
    expect(dbMock.state.updateCalls[0]?.set).toMatchObject({ archivedAt: expect.any(Date) });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});

// ─── Publishing rules (Task 4) ─────────────────────────────────────────
// These actions delegate to the brand service mutators, so we
// stub the four service exports above and assert on those mocks
// (in addition to the existing `dbMock`/`policyMock` invariants).

describe("createPublishingRuleAction", () => {
  it("rejects an unauthenticated caller", async () => {
    authMock.auth.mockResolvedValue(null);
    const result = await createPublishingRuleAction(
      slug,
      {},
      formData({ ruleType: "alt_text", title: "Alt text", content: "Describe the image." }),
    );
    expect(result).toEqual({ error: "Sign in is required." });
    expect(serviceMock.createBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("rejects a session without a user id", async () => {
    authMock.auth.mockResolvedValue({ user: {} });
    const result = await createPublishingRuleAction(
      slug,
      {},
      formData({ ruleType: "alt_text", title: "Alt text", content: "Describe the image." }),
    );
    expect(result).toEqual({ error: "Sign in is required." });
    expect(serviceMock.createBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("rejects a caller with no accessible workspace", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(null);
    const result = await createPublishingRuleAction(
      slug,
      {},
      formData({ ruleType: "alt_text", title: "Alt text", content: "Describe the image." }),
    );
    expect(result).toEqual({ error: "Workspace not found." });
    expect(serviceMock.createBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("rejects a caller without the brand_manager role", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    const result = await createPublishingRuleAction(
      slug,
      {},
      formData({ ruleType: "alt_text", title: "Alt text", content: "Describe the image." }),
    );
    expect(result).toEqual({ error: "Brand manager access is required." });
    expect(serviceMock.createBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("rejects an unknown ruleType", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createPublishingRuleAction(
      slug,
      {},
      formData({ ruleType: "marketing", title: "Forbidden", content: "Should not insert." }),
    );
    expect(result.error).toBeDefined();
    expect(serviceMock.createBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("rejects an empty title", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createPublishingRuleAction(
      slug,
      {},
      formData({ ruleType: "alt_text", title: "", content: "Describe the image." }),
    );
    expect(result.error).toBeDefined();
    expect(serviceMock.createBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("calls the service mutator with workspaceId + parsed payload + actor, and revalidates", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createPublishingRuleAction(
      slug,
      {},
      formData({ ruleType: "alt_text", title: "Alt text", content: "Describe the image." }),
    );
    expect(result).toEqual({ success: true });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(
      { id: session.user.id },
      workspace.id,
      ["workspace_manager", "content_planner"],
    );
    expect(serviceMock.createBrandPublishingRule).toHaveBeenCalledWith(
      { id: session.user.id },
      workspace.id,
      expect.objectContaining({
        ruleType: "alt_text",
        title: "Alt text",
        content: "Describe the image.",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});

describe("archivePublishingRuleAction", () => {
  it("returns silently when there is no session", async () => {
    authMock.auth.mockResolvedValue(null);
    await archivePublishingRuleAction(slug, "rule-1");
    expect(serviceMock.archiveBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("returns silently when the workspace is not accessible", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(null);
    await archivePublishingRuleAction(slug, "rule-1");
    expect(serviceMock.archiveBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("returns silently when the caller is not a brand_manager", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await archivePublishingRuleAction(slug, "rule-1");
    expect(serviceMock.archiveBrandPublishingRule).not.toHaveBeenCalled();
  });

  it("calls the service mutator with the rule id and workspaceId, then revalidates", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archivePublishingRuleAction(slug, "rule-1");
    expect(serviceMock.archiveBrandPublishingRule).toHaveBeenCalledWith(
      { id: session.user.id },
      workspace.id,
      "rule-1",
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});

// ─── Linked resources (Task 4) ─────────────────────────────────────────

describe("createLinkedResourceAction", () => {
  it("rejects an unauthenticated caller", async () => {
    authMock.auth.mockResolvedValue(null);
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({
        provider: "figma",
        name: "Library",
        url: "https://figma.com/file/x",
      }),
    );
    expect(result).toEqual({ error: "Sign in is required." });
    expect(serviceMock.createBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("rejects a session without a user id", async () => {
    authMock.auth.mockResolvedValue({ user: {} });
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({
        provider: "figma",
        name: "Library",
        url: "https://figma.com/file/x",
      }),
    );
    expect(result).toEqual({ error: "Sign in is required." });
    expect(serviceMock.createBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("rejects a caller with no accessible workspace", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(null);
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({
        provider: "figma",
        name: "Library",
        url: "https://figma.com/file/x",
      }),
    );
    expect(result).toEqual({ error: "Workspace not found." });
    expect(serviceMock.createBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("rejects a caller without the brand_manager role", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({
        provider: "figma",
        name: "Library",
        url: "https://figma.com/file/x",
      }),
    );
    expect(result).toEqual({ error: "Brand manager access is required." });
    expect(serviceMock.createBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("rejects a non-HTTPS url", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({ provider: "figma", name: "Library", url: "http://figma.com/file/x" }),
    );
    expect(result.error).toBeDefined();
    expect(serviceMock.createBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("rejects an unknown provider", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({ provider: "dropbox_clone", name: "Library", url: "https://example.com" }),
    );
    expect(result.error).toBeDefined();
    expect(serviceMock.createBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("rejects a non-URL string", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({ provider: "figma", name: "Library", url: "javascript:alert(1)" }),
    );
    expect(result.error).toBeDefined();
    expect(serviceMock.createBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("rejects an empty name", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({ provider: "figma", name: "", url: "https://figma.com/file/x" }),
    );
    expect(result.error).toBeDefined();
    expect(serviceMock.createBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("calls the service mutator with workspaceId + parsed payload + actor, and revalidates", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    const result = await createLinkedResourceAction(
      slug,
      {},
      formData({
        provider: "figma",
        name: "Master library",
        url: "https://figma.com/file/example",
        description: "Approved components",
      }),
    );
    expect(result).toEqual({ success: true });
    expect(policyMock.hasWorkspaceRole).toHaveBeenCalledWith(
      { id: session.user.id },
      workspace.id,
      ["workspace_manager", "content_planner"],
    );
    expect(serviceMock.createBrandLinkedResource).toHaveBeenCalledWith(
      { id: session.user.id },
      workspace.id,
      expect.objectContaining({
        provider: "figma",
        name: "Master library",
        url: "https://figma.com/file/example",
        description: "Approved components",
      }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});

describe("archiveLinkedResourceAction", () => {
  it("returns silently when there is no session", async () => {
    authMock.auth.mockResolvedValue(null);
    await archiveLinkedResourceAction(slug, "res-1");
    expect(serviceMock.archiveBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("returns silently when the workspace is not accessible", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(null);
    await archiveLinkedResourceAction(slug, "res-1");
    expect(serviceMock.archiveBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("returns silently when the caller is not a brand_manager", async () => {
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(false);
    await archiveLinkedResourceAction(slug, "res-1");
    expect(serviceMock.archiveBrandLinkedResource).not.toHaveBeenCalled();
  });

  it("calls the service mutator with the resource id and workspaceId, then revalidates", async () => {
    const { revalidatePath } = await import("next/cache");
    authMock.auth.mockResolvedValue(session);
    workspaceMock.getAccessibleWorkspace.mockResolvedValue(workspace);
    policyMock.hasWorkspaceRole.mockResolvedValue(true);
    await archiveLinkedResourceAction(slug, "res-1");
    expect(serviceMock.archiveBrandLinkedResource).toHaveBeenCalledWith(
      { id: session.user.id },
      workspace.id,
      "res-1",
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/app/w/${slug}/brand-kit`);
  });
});
