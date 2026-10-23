import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => ({ auth: vi.fn() }));
const agencyContextMock = vi.hoisted(() => ({ resolveActiveAgencyContext: vi.fn() }));
const workspaceMock = vi.hoisted(() => ({
  getAccessibleWorkspace: vi.fn(),
  getAccessibleWorkspaceAtPath: vi.fn(),
}));
const contentMock = vi.hoisted(() => ({
  claimAsDesigner: vi.fn(),
  transitionContent: vi.fn(),
  assignDesigner: vi.fn(),
}));
const loggerMock = vi.hoisted(() => ({ logError: vi.fn() }));
const dbMock = vi.hoisted(() => ({ select: vi.fn() }));
const approvalMock = vi.hoisted(() => ({ decideApproval: vi.fn() }));

vi.mock("@/lib/auth/config", () => authMock);
vi.mock("@/lib/auth/agency-context", () => agencyContextMock);
vi.mock("@/lib/workspaces/context", () => workspaceMock);
vi.mock("@/features/content/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/content/server")>();
  return {
    ...actual,
    claimAsDesigner: contentMock.claimAsDesigner,
    transitionContent: contentMock.transitionContent,
    assignDesigner: contentMock.assignDesigner,
  };
});
vi.mock("@/lib/observability/logger", () => loggerMock);
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/deliveries/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/deliveries/service")>();
  return { ...actual, decideApproval: approvalMock.decideApproval };
});

const { assignDesignerAction, claimAction, decideApprovalAction, transitionAction } =
  await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions");
const { ClaimAsDesignerError } = await import("@/features/content/server");
const { DomainError } = await import("@/lib/content/workflow");
const { ApprovalDecisionError } = await import("@/lib/deliveries/service");

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
  contentMock.transitionContent.mockReset();
  contentMock.assignDesigner.mockReset();
  loggerMock.logError.mockReset();
  dbMock.select.mockReset();
  approvalMock.decideApproval.mockReset();
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

  it("returns a stable code for expected workflow failures", async () => {
    contentMock.transitionContent.mockRejectedValue(
      new DomainError("invalid_transition", "Cannot approve from draft"),
    );

    const result = await transitionAction({
      workspaceSlug: "studio",
      contentItemId: "item-1",
      action: "approve_content",
    });

    expect(result).toEqual({ error: "workflowError.invalid_transition" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("does not return unexpected workflow exception details", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    contentMock.transitionContent.mockRejectedValue(error);

    const result = await transitionAction({
      workspaceSlug: "studio",
      contentItemId: "item-1",
      action: "approve_content",
    });

    expect(result).toEqual({ error: "workflowError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.workflow_transition_failed", {
      err: error,
    });
  });

  it("does not return unexpected designer assignment details", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    const limit = vi.fn().mockResolvedValue([{ status: "in_design" }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });
    contentMock.assignDesigner.mockRejectedValue(error);

    const result = await assignDesignerAction({
      workspaceSlug: "studio",
      contentItemId: "00000000-0000-4000-8000-000000000001",
      designerId: "00000000-0000-4000-8000-000000000002",
    });

    expect(result).toEqual({ error: "workflowError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.designer_assignment_failed", {
      err: error,
    });
  });

  it("returns a stable code for expected approval decision failures", async () => {
    approvalMock.decideApproval.mockRejectedValue(
      new ApprovalDecisionError("conflict", "Approval request is no longer pending"),
    );

    const result = await decideApprovalAction({
      workspaceSlug: "studio",
      approvalRequestId: "00000000-0000-4000-8000-000000000003",
      decision: "approved",
    });

    expect(result).toEqual({ error: "workflowError.conflict" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("does not return unexpected approval decision details", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    approvalMock.decideApproval.mockRejectedValue(error);

    const result = await decideApprovalAction({
      workspaceSlug: "studio",
      approvalRequestId: "00000000-0000-4000-8000-000000000003",
      decision: "approved",
    });

    expect(result).toEqual({ error: "workflowError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.approval_decision_failed", {
      err: error,
    });
  });
});
