import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
const workspaceMock = vi.hoisted(() => ({ getAccessibleWorkspaceAtPath: vi.fn() }));
const policyMock = vi.hoisted(() => ({ hasWorkspaceRole: vi.fn() }));
const agencyContextMock = vi.hoisted(() => ({ resolveActiveAgencyContext: vi.fn() }));
const aiMock = vi.hoisted(() => ({
  getActiveApiKey: vi.fn(),
  suggestLeadTimes: vi.fn(),
  suggestMonthlyTarget: vi.fn(),
}));
const loggerMock = vi.hoisted(() => ({ logError: vi.fn() }));
const dbMock = vi.hoisted(() => {
  const state: { rows: unknown[] } = { rows: [] };
  const db = {
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        limit: vi.fn(() => Promise.resolve([state.rows.shift()])),
      };
      return chain;
    }),
  };
  return { db, state };
});

vi.mock("@/lib/auth/config", () => authMock);
vi.mock("@/lib/workspaces/context", () => workspaceMock);
vi.mock("@/lib/auth/policy", () => policyMock);
vi.mock("@/lib/auth/agency-context", () => agencyContextMock);
vi.mock("@/lib/ai", () => aiMock);
vi.mock("@/lib/observability/logger", () => loggerMock);
vi.mock("@/lib/db", () => ({ db: dbMock.db }));

const { suggestLeadTimesAction, suggestMonthlyTargetAction } =
  await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/settings/ai-suggestions");

function setupEnabledAgency() {
  dbMock.state.rows.push(
    { enabled: true, enabledCapabilities: ["caption_drafts"] },
    {
      monthlyTarget: 20,
      contentApprovalLeadDays: 10,
      designCompleteLeadDays: 5,
      creativeApprovalLeadDays: 2,
      readyToPublishLeadDays: 1,
      approvalMode: "simple",
    },
    { timezone: "UTC" },
  );
}

beforeEach(() => {
  authMock.auth.mockReset().mockResolvedValue({ user: { id: "user-1" } });
  workspaceMock.getAccessibleWorkspaceAtPath.mockReset().mockResolvedValue({ id: "workspace-1" });
  policyMock.hasWorkspaceRole.mockReset().mockResolvedValue(true);
  agencyContextMock.resolveActiveAgencyContext
    .mockReset()
    .mockResolvedValue({ agencyId: "agency-1" });
  aiMock.getActiveApiKey.mockReset().mockResolvedValue("provider-key");
  aiMock.suggestLeadTimes.mockReset();
  aiMock.suggestMonthlyTarget.mockReset();
  loggerMock.logError.mockReset();
  dbMock.state.rows = [];
});

describe("workspace settings AI suggestion failures", () => {
  it("rejects an invalid approval mode before workspace or provider access", async () => {
    const result = await suggestLeadTimesAction("agency", "workspace", {
      approvalMode: "invalid",
    });

    expect(result).toEqual({ ok: false, errorCode: "invalidInput" });
    expect(authMock.auth).not.toHaveBeenCalled();
  });

  it("logs provider failures and returns a stable lead-time error code", async () => {
    setupEnabledAgency();
    const error = new Error("provider-key=credential-shaped-secret");
    aiMock.suggestLeadTimes.mockRejectedValue(error);

    const result = await suggestLeadTimesAction("agency", "workspace", {
      approvalMode: "simple",
    });

    expect(result).toEqual({ ok: false, errorCode: "failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("settings.lead_time_suggestion_failed", {
      err: error,
      workspaceId: "workspace-1",
    });
  });

  it("logs provider failures and returns a stable target error code", async () => {
    setupEnabledAgency();
    const error = new Error("provider-key=credential-shaped-secret");
    aiMock.suggestMonthlyTarget.mockRejectedValue(error);

    const result = await suggestMonthlyTargetAction("agency", "workspace");

    expect(result).toEqual({ ok: false, errorCode: "failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("settings.monthly_target_suggestion_failed", {
      err: error,
      workspaceId: "workspace-1",
    });
  });
});
