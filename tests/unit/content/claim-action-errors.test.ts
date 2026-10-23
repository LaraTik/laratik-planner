import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
const agencyContextMock = vi.hoisted(() => ({ resolveActiveAgencyContext: vi.fn() }));
const workspaceMock = vi.hoisted(() => ({
  getAccessibleWorkspace: vi.fn(),
  getAccessibleWorkspaceAtPath: vi.fn(),
}));
const contentMock = vi.hoisted(() => ({ claimAsDesigner: vi.fn() }));
const loggerMock = vi.hoisted(() => ({ logError: vi.fn() }));

vi.mock("@/lib/auth/config", () => authMock);
vi.mock("@/lib/auth/agency-context", () => agencyContextMock);
vi.mock("@/lib/workspaces/context", () => workspaceMock);
vi.mock("@/features/content/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/content/server")>();
  return { ...actual, claimAsDesigner: contentMock.claimAsDesigner };
});
vi.mock("@/lib/observability/logger", () => loggerMock);

const { claimAction } = await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions");
const { ClaimAsDesignerError } = await import("@/features/content/server");

beforeEach(() => {
  authMock.auth.mockReset().mockResolvedValue({ user: { id: "actor-1" } });
  agencyContextMock.resolveActiveAgencyContext
    .mockReset()
    .mockResolvedValue({ agencyId: "agency-1" });
  workspaceMock.getAccessibleWorkspace
    .mockReset()
    .mockResolvedValue({ id: "workspace-1", agencySlug: "agency" });
  workspaceMock.getAccessibleWorkspaceAtPath.mockReset();
  contentMock.claimAsDesigner.mockReset();
  loggerMock.logError.mockReset();
});

describe("claimAction error boundary", () => {
  it("returns stable safe copy and logs unexpected persistence details", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    contentMock.claimAsDesigner.mockRejectedValue(error);

    const result = await claimAction({ workspaceSlug: "studio", contentItemId: "item-1" });

    expect(result).toEqual({ error: "claimError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.designer_claim_failed", {
      err: error,
    });
  });

  it("preserves expected claim outcomes as stable error codes", async () => {
    contentMock.claimAsDesigner.mockRejectedValue(
      new ClaimAsDesignerError("already_assigned", "Already assigned to a designer"),
    );

    const result = await claimAction({ workspaceSlug: "studio", contentItemId: "item-1" });

    expect(result).toEqual({ error: "claimError.already_assigned" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });
});
