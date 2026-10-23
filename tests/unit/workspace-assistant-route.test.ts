import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  getAccessibleWorkspace: vi.fn(),
  hasWorkspaceRole: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  listWorkspaceContent: vi.fn(),
  chat: vi.fn(),
  getActiveApiKey: vi.fn(),
  loadEnabledCapabilities: vi.fn(),
  enforceAiBudget: vi.fn(),
  reconcileAiBudget: vi.fn(),
  releaseAiBudgetReservation: vi.fn(),
  recordAiUsageEvent: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: mocks.hasWorkspaceRole }));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: mocks.getAccessibleWorkspace,
}));
vi.mock("@/features/content/server", () => ({ listWorkspaceContent: mocks.listWorkspaceContent }));
vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock("@/lib/ai", () => ({ chat: mocks.chat, getActiveApiKey: mocks.getActiveApiKey }));
vi.mock("@/lib/ai/governance", () => ({
  loadEnabledCapabilities: mocks.loadEnabledCapabilities,
  enforceAiBudget: mocks.enforceAiBudget,
  reconcileAiBudget: mocks.reconcileAiBudget,
  releaseAiBudgetReservation: mocks.releaseAiBudgetReservation,
  recordAiUsageEvent: mocks.recordAiUsageEvent,
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/security/headers", () => ({
  mutatingApiHeaders: () => ({ "cache-control": "no-store" }),
}));
vi.mock("@/lib/entitlements", () => ({
  LimitExceededError: class LimitExceededError extends Error {
    details = {};
  },
}));

const { POST } = await import("@/app/api/ai/workspace-assistant/route");
const { LimitExceededError } = await import("@/lib/entitlements");

function query(value: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([value]));
  return chain;
}

function request(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/ai/workspace-assistant", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "assistant-request-1" },
    body: JSON.stringify({ workspaceSlug: "test-workspace", message: "Review the plan", ...body }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentActor.mockResolvedValue({ id: "user-1" });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.getAccessibleWorkspace.mockResolvedValue({ id: "workspace-1", slug: "test-workspace" });
  mocks.hasWorkspaceRole.mockResolvedValue(true);
  mocks.select
    .mockReturnValueOnce(query({ id: "workspace-1", timezone: "UTC", agencyId: "agency-1" }))
    .mockReturnValueOnce(
      query({
        enabled: true,
        enabledCapabilities: ["monthly_planning_copilot"],
        model: "MiniMax-M3",
      }),
    );
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({}),
  );
  mocks.listWorkspaceContent.mockResolvedValue([
    {
      id: "item-1",
      title: "Internal title excluded from model context",
      format: "post",
      status: "draft",
      plannedPublishAt: new Date("2026-11-02T10:00:00Z"),
    },
  ]);
  mocks.chat.mockResolvedValue({
    content: JSON.stringify({
      answer: "The plan has one item.",
      findings: [],
      recommendations: [],
      limitations: [],
    }),
    inputTokens: 100,
    outputTokens: 20,
    model: "MiniMax-M3",
  });
  mocks.getActiveApiKey.mockResolvedValue("managed-key");
  mocks.loadEnabledCapabilities.mockResolvedValue(new Set(["monthly_planning_copilot"]));
  mocks.enforceAiBudget.mockResolvedValue({
    estimatedInputTokens: 4_000,
    estimatedOutputTokens: 1_400,
  });
  mocks.reconcileAiBudget.mockResolvedValue(undefined);
  mocks.releaseAiBudgetReservation.mockResolvedValue(true);
  mocks.recordAiUsageEvent.mockResolvedValue(undefined);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
});

describe("POST /api/ai/workspace-assistant", () => {
  it("rejects roles outside planning before loading context or calling AI", async () => {
    mocks.hasWorkspaceRole.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.listWorkspaceContent).not.toHaveBeenCalled();
    expect(mocks.chat).not.toHaveBeenCalled();
  });

  it("returns schema-validated evidence and meters usage without persisting messages", async () => {
    const response = await POST(
      request({ history: [{ role: "user", content: "Earlier question" }] }),
    );

    expect(mocks.enforceAiBudget).toHaveBeenCalled();
    expect(mocks.listWorkspaceContent).toHaveBeenCalled();
    expect(mocks.getActiveApiKey).toHaveBeenCalled();
    expect(mocks.chat).toHaveBeenCalled();
    expect(mocks.chat.mock.calls[0]?.[0].model).toBe("MiniMax-M3");
    const body = await response.json();
    expect(response.status, JSON.stringify(body)).toBe(200);
    expect(body.answer.answer).toBe("The plan has one item.");
    expect(body.evidence[0]).toMatchObject({ source: "Planner content calendar", itemCount: 1 });
    expect(JSON.stringify(mocks.chat.mock.calls[0])).not.toContain("Internal title excluded");
    expect(mocks.chat.mock.calls[0]?.[0].messages[1].content).toContain("Earlier question");
    expect(mocks.reconcileAiBudget).toHaveBeenCalledOnce();
    expect(mocks.recordAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "monthly_planning_copilot",
        succeeded: true,
        contextCategories: ["workspace_plan_summary", "calendar_distribution", "content_mix"],
      }),
    );
  });

  it("sanitizes provider failures and releases the reserved budget", async () => {
    mocks.chat.mockRejectedValue(new Error("provider response contained private details"));

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "ai_provider_failed" });
    expect(mocks.releaseAiBudgetReservation).toHaveBeenCalledWith({
      agencyId: "agency-1",
      inputTokens: 4_000,
      outputTokens: 1_400,
    });
    expect(mocks.recordAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: false }),
    );
  });

  it("meters provider usage and rejects model references to unknown evidence", async () => {
    mocks.chat.mockResolvedValue({
      content: JSON.stringify({
        answer: "Review",
        findings: [
          {
            title: "Gap",
            detail: "Unsupported claim",
            severity: "medium",
            evidenceIds: ["invented"],
          },
        ],
        recommendations: [],
        limitations: [],
      }),
      inputTokens: 120,
      outputTokens: 30,
      model: "MiniMax-M3",
    });

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "ai_response_invalid" });
    expect(mocks.reconcileAiBudget).toHaveBeenCalledWith(
      expect.objectContaining({ actualInputTokens: 120, actualOutputTokens: 30 }),
    );
    expect(mocks.releaseAiBudgetReservation).not.toHaveBeenCalled();
    expect(mocks.recordAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: false }),
    );
  });

  it("records completed provider usage when quota reconciliation rejects the request", async () => {
    mocks.reconcileAiBudget.mockRejectedValue(
      new LimitExceededError({
        resource: "ai_tokens",
        currentUsage: 100,
        limit: 100,
        requestedIncrease: 20,
        userMessage: "quota reached",
      }),
    );

    const response = await POST(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ error: "ai_quota_exceeded" });
    expect(mocks.releaseAiBudgetReservation).not.toHaveBeenCalled();
    expect(mocks.recordAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({ succeeded: true, inputTokens: 100, outputTokens: 20 }),
    );
  });
});
