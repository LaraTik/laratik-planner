import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  getAccessibleWorkspaceAtPath: vi.fn(),
  requireCommunityPermission: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
  loadEnabledCapabilities: vi.fn(),
  getActiveApiKey: vi.fn(),
  enforceAiBudget: vi.fn(),
  reconcileAiBudget: vi.fn(),
  releaseAiBudgetReservation: vi.fn(),
  recordAiUsageEvent: vi.fn(),
  getEffectiveEntitlement: vi.fn(),
  enforceRateLimit: vi.fn(),
  captureError: vi.fn(),
  runCommunityTestLab: vi.fn(),
}));

class MockCommunityAccessError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspaceAtPath: mocks.getAccessibleWorkspaceAtPath,
}));
vi.mock("@/lib/community/service", () => ({
  CommunityAccessError: MockCommunityAccessError,
  requireCommunityPermission: mocks.requireCommunityPermission,
}));
vi.mock("@/lib/db", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
    insert: mocks.insert,
  },
}));
vi.mock("@/lib/ai", () => ({
  enforceAiBudget: mocks.enforceAiBudget,
  getActiveApiKey: mocks.getActiveApiKey,
  loadEnabledCapabilities: mocks.loadEnabledCapabilities,
  reconcileAiBudget: mocks.reconcileAiBudget,
  releaseAiBudgetReservation: mocks.releaseAiBudgetReservation,
  recordAiUsageEvent: mocks.recordAiUsageEvent,
}));
vi.mock("@/lib/community/ai-test-lab", async () => {
  const actual = await vi.importActual<typeof import("@/lib/community/ai-test-lab")>(
    "@/lib/community/ai-test-lab",
  );
  return {
    ...actual,
    blockedCommunityTestLabResult: vi.fn(() => ({
      schemaVersion: 1,
      previewOnly: true,
      draft: "",
      decision: "block",
      explanation: ["blocked"],
      safetyStatus: "blocked",
    })),
    containsCommunityPromptInjection: vi.fn(() => false),
    prepareCommunityTestLabInput: vi.fn((value) => value),
    runCommunityTestLab: mocks.runCommunityTestLab,
  };
});
vi.mock("@/lib/entitlements", () => ({
  getEffectiveEntitlement: mocks.getEffectiveEntitlement,
  LimitExceededError: class LimitExceededError extends Error {
    details = {};
  },
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/security/headers", () => ({
  mutatingApiHeaders: () => ({ "cache-control": "no-store" }),
}));
vi.mock("@/lib/observability/sentry", () => ({ captureError: mocks.captureError }));
vi.mock("@/lib/validation/env", () => ({ serverEnv: { MINIMAX_MODEL: "MiniMax-M3" } }));

const { POST } = await import("@/app/api/community/test-lab/route");

function request(message = "Can I get help with this order?") {
  return new NextRequest("http://localhost/api/community/test-lab", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "test-lab-1" },
    body: JSON.stringify({
      agencySlug: "laratik",
      workspaceSlug: "food-game",
      channel: "facebook_comments",
      message,
      scenario: "Customer support question",
    }),
  });
}

function chain<T>(value: T) {
  const query: Record<string, unknown> = {};
  query.from = vi.fn(() => query);
  query.where = vi.fn(() => query);
  query.limit = vi.fn(() => Promise.resolve([value]));
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ id: "user-1" });
  mocks.getAccessibleWorkspaceAtPath.mockResolvedValue({
    id: "workspace-1",
    agencyId: "agency-1",
  });
  mocks.requireCommunityPermission.mockResolvedValue(undefined);
  mocks.select.mockReturnValue(
    chain({ enabled: true, enabledCapabilities: ["community_reply_drafts"] }),
  );
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({}),
  );
  mocks.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  mocks.loadEnabledCapabilities.mockResolvedValue(new Set(["community_reply_drafts"]));
  mocks.getActiveApiKey.mockResolvedValue("server-only-key");
  mocks.enforceAiBudget.mockResolvedValue(undefined);
  mocks.reconcileAiBudget.mockResolvedValue(undefined);
  mocks.getEffectiveEntitlement.mockResolvedValue({ maxOutputTokensPerRequest: 800 });
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.releaseAiBudgetReservation.mockResolvedValue(true);
  mocks.recordAiUsageEvent.mockResolvedValue(undefined);
  mocks.runCommunityTestLab.mockResolvedValue({
    providerUsed: true,
    result: {
      schemaVersion: 1,
      previewOnly: true,
      draft: "Thanks for reaching out.",
      decision: "draft",
      explanation: ["A human can review this informational reply."],
      safetyStatus: "safe",
    },
  });
});

describe("POST /api/community/test-lab", () => {
  it("fails closed when the workspace cannot be resolved", async () => {
    mocks.getAccessibleWorkspaceAtPath.mockResolvedValue(null);

    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.requireCommunityPermission).not.toHaveBeenCalled();
    expect(mocks.runCommunityTestLab).not.toHaveBeenCalled();
  });

  it("enforces the Community review permission before AI governance", async () => {
    mocks.requireCommunityPermission.mockRejectedValue(
      new MockCommunityAccessError("permission_denied"),
    );

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "forbidden" });
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.getActiveApiKey).not.toHaveBeenCalled();
  });

  it("requires the separate agency capability", async () => {
    mocks.select.mockReturnValue(chain({ enabled: true, enabledCapabilities: [] }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "community_reply_drafts_disabled" });
    expect(mocks.getActiveApiKey).not.toHaveBeenCalled();
  });

  it("runs a preview, records usage, and never calls a provider adapter", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      previewOnly: true,
      result: { decision: "draft", safetyStatus: "safe" },
    });
    expect(mocks.requireCommunityPermission).toHaveBeenCalledWith(
      { id: "user-1" },
      { id: "workspace-1", agencyId: "agency-1" },
      "review_ai_drafts",
    );
    expect(mocks.enforceAiBudget).toHaveBeenCalledWith(
      expect.objectContaining({ capability: "community_reply_drafts" }),
    );
    expect(mocks.runCommunityTestLab).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "server-only-key",
        testInput: expect.objectContaining({ channel: "facebook_comments" }),
      }),
    );
    expect(mocks.reconcileAiBudget).toHaveBeenCalledOnce();
    expect(mocks.recordAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "community_reply_drafts",
        succeeded: true,
        inputTokens: expect.any(Number),
        outputTokens: 800,
        requestId: "test-lab-1",
      }),
    );
  });

  it("releases reserved tokens when provider execution fails", async () => {
    mocks.runCommunityTestLab.mockRejectedValue(new Error("provider detail"));

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(mocks.releaseAiBudgetReservation).toHaveBeenCalledWith({
      agencyId: "agency-1",
      inputTokens: expect.any(Number),
      outputTokens: 800,
    });
    expect(mocks.captureError).not.toHaveBeenCalled();
  });

  it("keeps reconciled provider usage when later usage logging fails", async () => {
    mocks.recordAiUsageEvent
      .mockRejectedValueOnce(new Error("usage log unavailable"))
      .mockResolvedValue(undefined);

    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(mocks.reconcileAiBudget).toHaveBeenCalledOnce();
    expect(mocks.releaseAiBudgetReservation).not.toHaveBeenCalled();
    expect(mocks.recordAiUsageEvent).toHaveBeenCalledTimes(2);
  });
});
