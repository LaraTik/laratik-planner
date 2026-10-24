import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  hasWorkspaceRole: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  getActiveApiKey: vi.fn(),
  loadEnabledCapabilities: vi.fn(),
  enforceAiBudget: vi.fn(),
  reconcileAiBudget: vi.fn(),
  releaseAiBudgetReservation: vi.fn(),
  recordAiUsageEvent: vi.fn(),
  enforceRateLimit: vi.fn(),
  getMonthlyPlanningSession: vi.fn(),
  appendMonthlyMessage: vi.fn(),
  askMonthlyPlanningCopilot: vi.fn(),
  captureError: vi.fn(),
}));

class MockLimitExceededError extends Error {
  details = { resource: "ai_tokens_month" };
}

function query(value: unknown) {
  const result: Record<string, unknown> = {};
  result.from = vi.fn(() => result);
  result.where = vi.fn(() => result);
  result.limit = vi.fn(async () => [value]);
  return result;
}

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: mocks.hasWorkspaceRole }));
vi.mock("@/lib/db", () => ({
  db: { select: mocks.select, transaction: mocks.transaction },
}));
vi.mock("@/lib/ai", () => ({
  getActiveApiKey: mocks.getActiveApiKey,
  loadEnabledCapabilities: mocks.loadEnabledCapabilities,
  enforceAiBudget: mocks.enforceAiBudget,
  reconcileAiBudget: mocks.reconcileAiBudget,
  releaseAiBudgetReservation: mocks.releaseAiBudgetReservation,
  recordAiUsageEvent: mocks.recordAiUsageEvent,
}));
vi.mock("@/lib/ai/monthly-planning", () => ({
  MonthlyPlanProposalSchema: { parse: vi.fn() },
  appendMonthlyMessage: mocks.appendMonthlyMessage,
  askMonthlyPlanningCopilot: mocks.askMonthlyPlanningCopilot,
  approveMonthlyProposal: vi.fn(),
  generateMonthlyProposal: vi.fn(),
  getMonthlyPlanningSession: mocks.getMonthlyPlanningSession,
  saveMonthlyProposal: vi.fn(),
}));
vi.mock("@/features/ai/server", () => ({ applyMonthlyProposalAtomically: vi.fn() }));
vi.mock("@/lib/content/batch", () => ({
  BatchCreateSchema: { safeParse: vi.fn() },
  parseBatchDateTime: vi.fn(),
}));
vi.mock("@/lib/brand/profile", () => ({ getBrandProfile: vi.fn() }));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/security/headers", () => ({
  mutatingApiHeaders: () => ({ "cache-control": "no-store" }),
}));
vi.mock("@/lib/security/public-error", () => ({
  publicProviderError: vi.fn(() => ({ message: "The AI request failed." })),
}));
vi.mock("@/lib/observability/sentry", () => ({ captureError: mocks.captureError }));
vi.mock("@/lib/entitlements", () => ({ LimitExceededError: MockLimitExceededError }));

const { POST } = await import("@/app/api/ai/monthly-planning/route");

function request(message?: string) {
  return new NextRequest("http://localhost/api/ai/monthly-planning", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "monthly-test-1" },
    body: JSON.stringify({
      workspaceId: "11111111-1111-4111-8111-111111111111",
      sessionId: "22222222-2222-4222-8222-222222222222",
      action: "message",
      ...(message === undefined ? {} : { message }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.currentActor.mockResolvedValue({ id: "user-1" });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.hasWorkspaceRole.mockResolvedValue(true);
  mocks.select
    .mockReturnValueOnce(
      query({
        id: "11111111-1111-4111-8111-111111111111",
        agencyId: "agency-1",
        timezone: "UTC",
      }),
    )
    .mockReturnValueOnce(
      query({ enabled: true, enabledCapabilities: ["monthly_planning_copilot"] }),
    );
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({}),
  );
  mocks.getActiveApiKey.mockResolvedValue("server-only-key");
  mocks.loadEnabledCapabilities.mockResolvedValue(new Set(["monthly_planning_copilot"]));
  mocks.enforceAiBudget.mockResolvedValue({
    estimatedInputTokens: 1800,
    estimatedOutputTokens: 1600,
  });
  mocks.reconcileAiBudget.mockResolvedValue(undefined);
  mocks.releaseAiBudgetReservation.mockResolvedValue(true);
  mocks.recordAiUsageEvent.mockResolvedValue(undefined);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.getMonthlyPlanningSession.mockResolvedValue({
    session: { id: "22222222-2222-4222-8222-222222222222", sourceRevision: "r1" },
    proposals: [],
  });
  mocks.appendMonthlyMessage.mockResolvedValue(undefined);
  mocks.askMonthlyPlanningCopilot.mockResolvedValue({
    content: "A planning reply",
    inputTokens: 10,
    outputTokens: 5,
  });
});

describe("POST /api/ai/monthly-planning budget handling", () => {
  it("rejects an empty message before reserving token budget", async () => {
    const response = await POST(request("   "));

    expect(response.status).toBe(400);
    expect(mocks.enforceAiBudget).not.toHaveBeenCalled();
    expect(mocks.releaseAiBudgetReservation).not.toHaveBeenCalled();
  });

  it("releases the estimated tokens when provider generation fails", async () => {
    const providerError = new Error("upstream token=secret");
    mocks.askMonthlyPlanningCopilot.mockRejectedValue(providerError);

    const response = await POST(request("Plan next month"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "The AI request failed." });
    expect(mocks.releaseAiBudgetReservation).toHaveBeenCalledWith({
      agencyId: "agency-1",
      inputTokens: 1800,
      outputTokens: 1600,
    });
    expect(mocks.captureError).toHaveBeenCalledWith(
      "ai.monthly_planning_failed",
      providerError,
      expect.objectContaining({ workspaceId: "11111111-1111-4111-8111-111111111111" }),
    );
    expect(mocks.recordAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "monthly_planning_copilot",
        requestId: "monthly-test-1",
        succeeded: false,
        inputTokens: 0,
        outputTokens: 0,
      }),
    );
  });

  it("keeps reconciled tokens when later transcript persistence fails", async () => {
    mocks.appendMonthlyMessage
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("transcript store unavailable"));

    const response = await POST(request("Plan next month"));

    expect(response.status).toBe(502);
    expect(mocks.reconcileAiBudget).toHaveBeenCalledOnce();
    expect(mocks.releaseAiBudgetReservation).not.toHaveBeenCalled();
    expect(mocks.recordAiUsageEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        capability: "monthly_planning_copilot",
        succeeded: true,
        inputTokens: 10,
        outputTokens: 5,
      }),
    );
  });

  it("maps a budget limit to 429 without attempting a token refund", async () => {
    mocks.enforceAiBudget.mockRejectedValue(new MockLimitExceededError("limit"));

    const response = await POST(request("Plan next month"));

    expect(response.status).toBe(429);
    expect(mocks.releaseAiBudgetReservation).not.toHaveBeenCalled();
  });
});
