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
  assignContentOwner: vi.fn(),
  quickCreateContentItem: vi.fn(),
  updateContentItem: vi.fn(),
  updateFormatPayload: vi.fn(),
  applyResearchTeardownToFormatPayload: vi.fn(),
  updateAudienceCopy: vi.fn(),
  patchAudienceCopy: vi.fn(),
}));
const loggerMock = vi.hoisted(() => ({ logError: vi.fn() }));
const dbMock = vi.hoisted(() => ({ select: vi.fn() }));
const approvalMock = vi.hoisted(() => ({ decideApproval: vi.fn() }));
const publicationMock = vi.hoisted(() => ({ recordPublication: vi.fn() }));

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
    assignContentOwner: contentMock.assignContentOwner,
    quickCreateContentItem: contentMock.quickCreateContentItem,
    updateContentItem: contentMock.updateContentItem,
    updateFormatPayload: contentMock.updateFormatPayload,
    applyResearchTeardownToFormatPayload: contentMock.applyResearchTeardownToFormatPayload,
    updateAudienceCopy: contentMock.updateAudienceCopy,
    patchAudienceCopy: contentMock.patchAudienceCopy,
  };
});
vi.mock("@/lib/observability/logger", () => loggerMock);
vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/deliveries/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/deliveries/service")>();
  return { ...actual, decideApproval: approvalMock.decideApproval };
});
vi.mock("@/lib/publishing/service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/publishing/service")>();
  return { ...actual, recordPublication: publicationMock.recordPublication };
});

const {
  changeContentOwnerAction,
  assignDesignerAction,
  applyResearchTeardownAction,
  applyAiDraftAction,
  claimAction,
  decideApprovalAction,
  recordPublicationAction,
  quickCreateAction,
  patchAudienceCopyAction,
  transitionAction,
  updateContentItemAction,
  updateAudienceCopyAction,
  updateFormatPayloadAction,
} = await import("@/app/(app)/app/a/[agencySlug]/w/[slug]/planning/actions");
const { ClaimAsDesignerError } = await import("@/features/content/server");
const { DomainError } = await import("@/lib/content/workflow");
const { ApprovalDecisionError } = await import("@/lib/deliveries/service");
const { PublicationRecordError } = await import("@/lib/publishing/service");

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
  contentMock.assignContentOwner.mockReset();
  contentMock.quickCreateContentItem.mockReset();
  contentMock.updateContentItem.mockReset();
  contentMock.updateFormatPayload.mockReset();
  contentMock.applyResearchTeardownToFormatPayload.mockReset();
  contentMock.updateAudienceCopy.mockReset();
  contentMock.patchAudienceCopy.mockReset();
  loggerMock.logError.mockReset();
  dbMock.select.mockReset();
  approvalMock.decideApproval.mockReset();
  publicationMock.recordPublication.mockReset();
});

describe("claimAction error boundary", () => {
  it("does not return unexpected quick-create persistence details", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    workspaceMock.getAccessibleWorkspace.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000008",
      agencySlug: "agency",
    });
    contentMock.quickCreateContentItem.mockRejectedValue(error);
    const formData = new FormData();
    formData.set("title", "New post");
    formData.set("format", "static_post");
    formData.set("plannedPublishAt", "2026-11-01T10:00:00.000Z");

    const result = await quickCreateAction("studio", {}, formData);

    expect(result).toEqual({ error: "contentMutationError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.content_create_failed", {
      err: error,
    });
  });

  it("returns a stable code for expected content edit failures", async () => {
    workspaceMock.getAccessibleWorkspace.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000008",
      agencySlug: "agency",
    });
    contentMock.updateContentItem.mockRejectedValue(
      new DomainError("invalid_transition", "This item can no longer be edited"),
    );
    const formData = new FormData();
    formData.set("title", "Updated post");
    formData.set("format", "static_post");
    formData.set("brief", "An updated short brief");
    formData.set("plannedPublishAt", "2026-11-01T10:00:00.000Z");

    const result = await updateContentItemAction(
      "studio",
      "00000000-0000-4000-8000-000000000009",
      {},
      formData,
    );

    expect(result).toEqual({ error: "contentMutationError.invalid_transition" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("does not return unexpected creative-payload persistence details", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    contentMock.updateFormatPayload.mockRejectedValue(error);
    const formData = new FormData();
    formData.set("contentItemId", "00000000-0000-4000-8000-000000000009");
    formData.set("format", "static_post");
    formData.set("formatPayload", "{}");

    const result = await updateFormatPayloadAction("studio", {}, formData);

    expect(result).toEqual({ error: "contentMutationError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.format_payload_update_failed", {
      err: error,
    });
  });

  it("does not return unexpected research-teardown persistence details", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    workspaceMock.getAccessibleWorkspace.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000008",
      agencySlug: "agency",
    });
    contentMock.applyResearchTeardownToFormatPayload.mockRejectedValue(error);

    const result = await applyResearchTeardownAction({
      workspaceSlug: "studio",
      contentItemId: "00000000-0000-4000-8000-000000000009",
      researchTeardownId: "00000000-0000-4000-8000-000000000010",
    });

    expect(result).toEqual({ error: "contentMutationError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.research_teardown_apply_failed", {
      err: error,
    });
  });

  it("returns a stable code for expected audience-copy update failures", async () => {
    contentMock.updateAudienceCopy.mockRejectedValue(
      new DomainError("invalid_transition", "This item can no longer be edited"),
    );
    const formData = new FormData();
    formData.set("contentItemId", "00000000-0000-4000-8000-000000000009");
    formData.set("format", "static_post");
    formData.set("formatPayload", "{}");

    const result = await updateAudienceCopyAction("studio", {}, formData);

    expect(result).toEqual({ error: "contentMutationError.invalid_transition" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("returns a stable validation code for an empty legacy audience-copy patch", async () => {
    contentMock.patchAudienceCopy.mockRejectedValue(
      new DomainError("validation_failed", "At least one audience-copy field must be provided."),
    );
    const formData = new FormData();
    formData.set("contentItemId", "00000000-0000-4000-8000-000000000009");

    const result = await patchAudienceCopyAction("studio", {}, formData);

    expect(result).toEqual({ error: "contentMutationError.validation_failed" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("does not apply an AI draft to a content item outside the route workspace", async () => {
    const limit = vi.fn().mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000009",
        workspaceId: "workspace-other",
        title: "Other workspace item",
        format: "static_post",
        brief: "Existing brief",
        plannedPublishAt: new Date("2026-11-01T10:00:00.000Z"),
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    dbMock.select.mockReturnValue({ from });

    const result = await applyAiDraftAction({
      workspaceSlug: "studio",
      contentItemId: "00000000-0000-4000-8000-000000000009",
      draftText: "Suggested brief",
      mode: "replace",
    });

    expect(result).toEqual({ error: "contentMutationError.not_found" });
    expect(contentMock.updateContentItem).not.toHaveBeenCalled();
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("sanitizes AI draft read and persistence failures", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    dbMock.select.mockImplementation(() => {
      throw error;
    });

    const result = await applyAiDraftAction({
      workspaceSlug: "studio",
      contentItemId: "00000000-0000-4000-8000-000000000009",
      draftText: "Suggested brief",
      mode: "replace",
    });

    expect(result).toEqual({ error: "contentMutationError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.ai_draft_apply_failed", {
      err: error,
    });
  });

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

  it("returns a stable code for expected owner assignment failures", async () => {
    contentMock.assignContentOwner.mockRejectedValue(new DomainError("not_found", "missing item"));

    const result = await changeContentOwnerAction({
      workspaceSlug: "studio",
      contentItemId: "00000000-0000-4000-8000-000000000005",
      ownerId: "00000000-0000-4000-8000-000000000006",
    });

    expect(result).toEqual({ error: "ownerError.not_found" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("does not return unexpected owner assignment details", async () => {
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    contentMock.assignContentOwner.mockRejectedValue(error);

    const result = await changeContentOwnerAction({
      workspaceSlug: "studio",
      contentItemId: "00000000-0000-4000-8000-000000000005",
      ownerId: "00000000-0000-4000-8000-000000000006",
    });

    expect(result).toEqual({ error: "ownerError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.content_owner_assignment_failed", {
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

  it("returns a stable code for expected publication record failures", async () => {
    workspaceMock.getAccessibleWorkspaceAtPath.mockResolvedValue({
      id: "workspace-1",
      agencySlug: "agency",
    });
    publicationMock.recordPublication.mockRejectedValue(
      new PublicationRecordError("conflict", "Content changed before the update completed"),
    );

    const result = await recordPublicationAction({
      workspaceSlug: "studio",
      agencySlug: "agency",
      contentItemChannelId: "00000000-0000-4000-8000-000000000004",
      status: "published",
      publishedUrl: "https://example.test/post",
    });

    expect(result).toEqual({ error: "publicationError.conflict" });
    expect(loggerMock.logError).not.toHaveBeenCalled();
  });

  it("does not return unexpected publication persistence details", async () => {
    workspaceMock.getAccessibleWorkspaceAtPath.mockResolvedValue({
      id: "workspace-1",
      agencySlug: "agency",
    });
    const error = new Error("postgres://planner:credential-shaped-secret@db.test/planner");
    publicationMock.recordPublication.mockRejectedValue(error);

    const result = await recordPublicationAction({
      workspaceSlug: "studio",
      agencySlug: "agency",
      contentItemChannelId: "00000000-0000-4000-8000-000000000004",
      status: "published",
      publishedUrl: "https://example.test/post",
    });

    expect(result).toEqual({ error: "publicationError.failed" });
    expect(JSON.stringify(result)).not.toContain("credential-shaped-secret");
    expect(loggerMock.logError).toHaveBeenCalledWith("planning.publication_record_failed", {
      err: error,
    });
  });
});
