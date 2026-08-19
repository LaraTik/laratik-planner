import { describe, expect, it } from "vitest";
import {
  DomainError,
  resolveWorkflowTransition,
  type WorkflowTransitionInput,
} from "@/lib/content/workflow";

function transition(
  input: Partial<WorkflowTransitionInput> & Pick<WorkflowTransitionInput, "action">,
) {
  return resolveWorkflowTransition({
    action: input.action,
    currentStatus: input.currentStatus ?? "draft",
    actorRoles: input.actorRoles ?? ["workspace_manager"],
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.statusReturnTarget !== undefined
      ? { statusReturnTarget: input.statusReturnTarget }
      : {}),
  });
}

describe("content workflow state machine", () => {
  it("moves a planner draft into content review", () => {
    expect(
      transition({ action: "submit_content_review", actorRoles: ["content_planner"] }),
    ).toMatchObject({ to: "content_review", changeRequestGate: null });
  });

  it("rejects a transition from the wrong state with a structured error", () => {
    expect(() => transition({ action: "approve_content", currentStatus: "draft" })).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: "invalid_transition" }),
    );
  });

  it("rejects a transition by the wrong role", () => {
    expect(() =>
      transition({
        action: "approve_content",
        currentStatus: "content_review",
        actorRoles: ["designer"],
      }),
    ).toThrowError(expect.objectContaining<Partial<DomainError>>({ code: "unauthorized" }));
  });

  it("requires feedback and records the correct content change gate", () => {
    expect(() =>
      transition({
        action: "request_content_changes",
        currentStatus: "content_review",
        actorRoles: ["internal_reviewer"],
      }),
    ).toThrowError(expect.objectContaining<Partial<DomainError>>({ code: "validation_failed" }));

    expect(
      transition({
        action: "request_content_changes",
        currentStatus: "content_review",
        actorRoles: ["internal_reviewer"],
        reason: "Clarify the CTA",
      }),
    ).toMatchObject({
      to: "changes_requested",
      changeRequestGate: "content",
      statusReturnTarget: "content_review",
    });
  });

  it("records creative change requests and returns the item to design", () => {
    expect(
      transition({
        action: "request_creative_changes",
        currentStatus: "creative_review",
        actorRoles: ["internal_reviewer"],
        reason: "Replace frame two",
      }),
    ).toMatchObject({
      to: "changes_requested",
      changeRequestGate: "creative_internal",
      statusReturnTarget: "in_design",
    });
  });

  it("unblocks to the saved state and never to a terminal state", () => {
    expect(
      transition({
        action: "unblock",
        currentStatus: "blocked",
        statusReturnTarget: "in_design",
      }),
    ).toMatchObject({ to: "in_design", blockedReason: null, statusReturnTarget: null });
    expect(
      transition({
        action: "unblock",
        currentStatus: "blocked",
        statusReturnTarget: "published",
      }),
    ).toMatchObject({ to: "draft" });
  });

  it("requires reasons for blocking and cancellation", () => {
    expect(() => transition({ action: "block" })).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: "validation_failed" }),
    );
    expect(() => transition({ action: "cancel" })).toThrowError(
      expect.objectContaining<Partial<DomainError>>({ code: "validation_failed" }),
    );
  });
});
