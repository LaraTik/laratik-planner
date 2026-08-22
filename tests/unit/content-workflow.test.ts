import { describe, expect, it } from "vitest";
import {
  DomainError,
  resolveWorkflowTransition,
  type WorkflowTransitionInput,
} from "@/lib/content/workflow";
import type { ContentStatus } from "@/lib/content/status";
import type { WorkspaceRole } from "@/lib/content/workflow";

const baseInput = (overrides: Partial<WorkflowTransitionInput> = {}): WorkflowTransitionInput => ({
  action: "submit_content_review",
  currentStatus: "draft" as ContentStatus,
  actorRoles: ["content_planner" as WorkspaceRole],
  ...overrides,
});

describe("resolveWorkflowTransition", () => {
  it("transitions submit_content_review from draft to content_review for content_planner", () => {
    const out = resolveWorkflowTransition(baseInput());
    expect(out.to).toBe("content_review");
    expect(out.changeRequestGate).toBeNull();
  });

  it("blocks submit_content_review from any state other than draft", () => {
    expect(() => resolveWorkflowTransition(baseInput({ currentStatus: "in_design" }))).toThrow(
      DomainError,
    );
  });

  it("blocks content_planner from cancelling (workspace_manager only)", () => {
    expect(() =>
      resolveWorkflowTransition(
        baseInput({
          action: "cancel",
          currentStatus: "draft",
          actorRoles: ["content_planner"],
          reason: "x",
        }),
      ),
    ).toThrow(DomainError);
  });

  it("requires a reason for cancel", () => {
    expect(() =>
      resolveWorkflowTransition(
        baseInput({ action: "cancel", currentStatus: "draft", actorRoles: ["workspace_manager"] }),
      ),
    ).toThrow(DomainError);
  });

  it("requires a reason for block", () => {
    expect(() =>
      resolveWorkflowTransition(
        baseInput({
          action: "block",
          currentStatus: "in_design",
          actorRoles: ["workspace_manager"],
        }),
      ),
    ).toThrow(DomainError);
  });

  it("captures the reason for block into blockedReason", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "block",
        currentStatus: "in_design",
        actorRoles: ["workspace_manager"],
        reason: "Waiting on legal",
      }),
    );
    expect(out.to).toBe("blocked");
    expect(out.blockedReason).toBe("Waiting on legal");
    expect(out.statusReturnTarget).toBe("in_design");
  });

  it("captures the reason for cancel into cancellationReason", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "cancel",
        currentStatus: "draft",
        actorRoles: ["workspace_manager"],
        reason: "Duplicate",
      }),
    );
    expect(out.to).toBe("cancelled");
    expect(out.cancellationReason).toBe("Duplicate");
  });

  it("request_content_changes sets changeRequestGate to content and returns to content_review", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "request_content_changes",
        currentStatus: "content_review",
        actorRoles: ["internal_reviewer"],
        reason: "Tone is off",
      }),
    );
    expect(out.to).toBe("changes_requested");
    expect(out.changeRequestGate).toBe("content");
    expect(out.statusReturnTarget).toBe("content_review");
  });

  it("request_creative_changes by internal_reviewer sets changeRequestGate to creative_internal", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "request_creative_changes",
        currentStatus: "creative_review",
        actorRoles: ["internal_reviewer"],
        reason: "Branding off",
      }),
    );
    expect(out.changeRequestGate).toBe("creative_internal");
    expect(out.statusReturnTarget).toBe("in_design");
  });

  it("request_creative_changes by client_reviewer sets changeRequestGate to creative_client", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "request_creative_changes",
        currentStatus: "creative_review",
        actorRoles: ["client_reviewer"],
        reason: "Logo color",
      }),
    );
    expect(out.changeRequestGate).toBe("creative_client");
    expect(out.statusReturnTarget).toBe("in_design");
  });

  it("unblock requires blocked status", () => {
    expect(() =>
      resolveWorkflowTransition(
        baseInput({ action: "unblock", currentStatus: "draft", actorRoles: ["workspace_manager"] }),
      ),
    ).toThrow(DomainError);
  });

  it("unblock by workspace_manager returns to statusReturnTarget when in safe set", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "unblock",
        currentStatus: "blocked",
        actorRoles: ["workspace_manager"],
        statusReturnTarget: "in_design",
      }),
    );
    expect(out.to).toBe("in_design");
    expect(out.blockedReason).toBeNull();
  });

  it("unblock with unsafe statusReturnTarget falls back to draft", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "unblock",
        currentStatus: "blocked",
        actorRoles: ["workspace_manager"],
        statusReturnTarget: "cancelled",
      }),
    );
    expect(out.to).toBe("draft");
  });

  it("unblock by non-workspace_manager is rejected", () => {
    expect(() =>
      resolveWorkflowTransition(
        baseInput({ action: "unblock", currentStatus: "blocked", actorRoles: ["content_planner"] }),
      ),
    ).toThrow(DomainError);
  });

  it("approve_internal_creative transitions creative_review -> ready_to_publish", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "approve_internal_creative",
        currentStatus: "creative_review",
        actorRoles: ["internal_reviewer"],
      }),
    );
    expect(out.to).toBe("ready_to_publish");
  });

  it("approve_client_creative transitions creative_review -> ready_to_publish", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "approve_client_creative",
        currentStatus: "creative_review",
        actorRoles: ["client_reviewer"],
      }),
    );
    expect(out.to).toBe("ready_to_publish");
  });

  it("record_published from ready_to_publish transitions to published", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "record_published",
        currentStatus: "ready_to_publish",
        actorRoles: ["publisher"],
      }),
    );
    expect(out.to).toBe("published");
  });

  it("rejects record_published from draft", () => {
    expect(() =>
      resolveWorkflowTransition(
        baseInput({
          action: "record_published",
          currentStatus: "draft",
          actorRoles: ["publisher"],
        }),
      ),
    ).toThrow(DomainError);
  });

  it("approve_content transitions content_review -> approved_for_design", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "approve_content",
        currentStatus: "content_review",
        actorRoles: ["internal_reviewer"],
      }),
    );
    expect(out.to).toBe("approved_for_design");
  });

  it("assign_designer transitions approved_for_design -> in_design (workspace_manager only)", () => {
    const out = resolveWorkflowTransition(
      baseInput({
        action: "assign_designer",
        currentStatus: "approved_for_design",
        actorRoles: ["workspace_manager"],
      }),
    );
    expect(out.to).toBe("in_design");
  });
});
