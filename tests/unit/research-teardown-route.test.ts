import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const TEARDOWN = {
  schemaVersion: 1 as const,
  hook: "Lead with the customer mistake.",
  promise: "Show one practical fix.",
  format: "short_form_video",
  beats: [{ label: "Proof", description: "Demonstrate the fix." }],
  pacing: "Fast opening, one proof beat, then a close.",
  callToAction: "Save this for later.",
  evidence: [
    { field: "hook" as const, observation: "The problem appears first.", source: "Notes" },
  ],
  uncertainty: [],
};

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  currentActor: vi.fn(),
  resolveActiveAgencyContext: vi.fn(),
  hasWorkspaceRole: vi.fn(),
  getAccessibleWorkspace: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  insert: vi.fn(),
  enforceAiBudget: vi.fn(),
  generateResearchTeardown: vi.fn(),
  getActiveApiKey: vi.fn(),
  reconcileAiBudget: vi.fn(),
  enforceRateLimit: vi.fn(),
  getEffectiveEntitlement: vi.fn(),
  recordUsage: vi.fn(),
  captureError: vi.fn(),
  publicProviderError: vi.fn(),
}));

vi.mock("@/lib/auth/config", () => ({ auth: mocks.auth }));
vi.mock("@/lib/auth/current-actor", () => ({ currentActor: mocks.currentActor }));
vi.mock("@/lib/auth/agency-context", () => ({
  resolveActiveAgencyContext: mocks.resolveActiveAgencyContext,
}));
vi.mock("@/lib/auth/policy", () => ({ hasWorkspaceRole: mocks.hasWorkspaceRole }));
vi.mock("@/lib/workspaces/context", () => ({
  getAccessibleWorkspace: mocks.getAccessibleWorkspace,
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
  generateResearchTeardown: mocks.generateResearchTeardown,
  getActiveApiKey: mocks.getActiveApiKey,
  reconcileAiBudget: mocks.reconcileAiBudget,
  LimitExceededError: class LimitExceededError extends Error {},
}));
vi.mock("@/lib/security/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/security/headers", () => ({
  mutatingApiHeaders: () => ({ "cache-control": "no-store" }),
}));
vi.mock("@/lib/security/public-error", () => ({
  publicProviderError: mocks.publicProviderError,
}));
vi.mock("@/lib/entitlements", () => ({
  getEffectiveEntitlement: mocks.getEffectiveEntitlement,
  LimitExceededError: class LimitExceededError extends Error {},
}));
vi.mock("@/lib/usage", () => ({ recordUsage: mocks.recordUsage }));
vi.mock("@/lib/observability/sentry", () => ({ captureError: mocks.captureError }));
vi.mock("@/lib/validation/env", () => ({
  serverEnv: { MINIMAX_MODEL: "MiniMax-M3" },
}));

const { POST } = await import("@/app/api/research/teardown/route");

function request(notes = "Planner notes about the observed video") {
  return new NextRequest("http://localhost/api/research/teardown", {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": "request-1" },
    body: JSON.stringify({ workspaceSlug: "acme", notes }),
  });
}

function featureChain(feature: { enabled: boolean; enabledCapabilities: string[] }) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = vi.fn(() => Promise.resolve([feature]));
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
  mocks.currentActor.mockResolvedValue({ id: "user-1" });
  mocks.resolveActiveAgencyContext.mockResolvedValue({ agencyId: "agency-1" });
  mocks.getAccessibleWorkspace.mockResolvedValue({ id: "workspace-1", slug: "acme" });
  mocks.hasWorkspaceRole.mockResolvedValue(true);
  mocks.select.mockReturnValue(
    featureChain({ enabled: true, enabledCapabilities: ["brief_improvement"] }),
  );
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({}),
  );
  mocks.insert.mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
  mocks.enforceAiBudget.mockResolvedValue(undefined);
  mocks.generateResearchTeardown.mockImplementation(
    async ({ onUsage }: { onUsage: (usage: unknown) => void }) => {
      onUsage({ inputTokens: 100, outputTokens: 40 });
      return JSON.stringify(TEARDOWN);
    },
  );
  mocks.getActiveApiKey.mockResolvedValue("server-only-key");
  mocks.reconcileAiBudget.mockResolvedValue(undefined);
  mocks.enforceRateLimit.mockResolvedValue({ allowed: true });
  mocks.getEffectiveEntitlement.mockResolvedValue({
    enabledAiCapabilities: new Set(["brief_improvement"]),
    maxOutputTokensPerRequest: 900,
  });
  mocks.recordUsage.mockResolvedValue(undefined);
  mocks.publicProviderError.mockReturnValue({ message: "provider_error" });
});

describe("research teardown AI route", () => {
  it("fails closed when the agency capability is disabled", async () => {
    mocks.select.mockReturnValue(featureChain({ enabled: false, enabledCapabilities: [] }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "research_teardown_disabled" });
    expect(mocks.getActiveApiKey).not.toHaveBeenCalled();
    expect(mocks.generateResearchTeardown).not.toHaveBeenCalled();
  });

  it("fails closed when the plan does not include the capability", async () => {
    mocks.getEffectiveEntitlement.mockResolvedValue({
      enabledAiCapabilities: new Set<string>(),
      maxOutputTokensPerRequest: 900,
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "research_teardown_not_in_plan" });
    expect(mocks.generateResearchTeardown).not.toHaveBeenCalled();
  });

  it("returns a preview and records reconciled usage with a redacted manifest", async () => {
    const response = await POST(request());
    const body = (await response.json()) as { teardown: unknown; previewOnly: boolean };

    expect(response.status).toBe(200);
    expect(body).toEqual({ teardown: TEARDOWN, previewOnly: true });
    expect(mocks.enforceAiBudget).toHaveBeenCalledOnce();
    expect(mocks.reconcileAiBudget).toHaveBeenCalledWith(
      expect.objectContaining({ actualInputTokens: 100, actualOutputTokens: 40 }),
    );
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({
        succeeded: true,
        contextManifest: { categories: ["research_notes", "preview_only"] },
      }),
    );
  });

  it("refunds the reservation and records a failed event when the provider fails", async () => {
    mocks.generateResearchTeardown.mockRejectedValue(new Error("provider unavailable"));

    const response = await POST(request());

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "provider_error" });
    expect(mocks.recordUsage).toHaveBeenCalledTimes(2);
    expect(mocks.recordUsage).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      "agency-1",
      "ai_input_tokens_month",
      expect.any(Number),
    );
    expect(mocks.recordUsage.mock.calls[0]?.[3]).toBeLessThan(0);
    expect(mocks.insert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({
        succeeded: false,
        contextManifest: { categories: ["research_notes", "preview_only"] },
      }),
    );
    expect(mocks.captureError).toHaveBeenCalledWith(
      "research.teardown_failed",
      expect.any(Error),
      expect.objectContaining({ requestId: "request-1" }),
    );
  });
});
