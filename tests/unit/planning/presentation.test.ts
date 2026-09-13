import { describe, expect, it } from "vitest";
import {
  PLANNING_WORKFLOW_STAGES,
  buildPlanningPresentation,
  planningStageForStatus,
} from "@/lib/planning/presentation";

const NOW = new Date("2026-09-13T12:00:00.000Z");

function readiness(overrides: Record<string, unknown> = {}) {
  return {
    blockers: 0,
    recommendations: 0,
    requiredTotal: 8,
    requiredCompleted: 8,
    canPublish: true,
    issues: [],
    ...overrides,
  };
}

describe("planningStageForStatus", () => {
  it("covers every internal status without assigning a false stage to conditions", () => {
    expect(PLANNING_WORKFLOW_STAGES).toEqual([
      "planning",
      "content_review",
      "creative_production",
      "creative_approval",
      "publishing_setup",
      "published",
    ]);

    expect(planningStageForStatus("draft")).toBe("planning");
    expect(planningStageForStatus("content_review")).toBe("content_review");
    expect(planningStageForStatus("changes_requested")).toBe("content_review");
    expect(planningStageForStatus("approved_for_design")).toBe("creative_production");
    expect(planningStageForStatus("in_design")).toBe("creative_production");
    expect(planningStageForStatus("creative_review")).toBe("creative_approval");
    expect(planningStageForStatus("ready_to_publish")).toBe("publishing_setup");
    expect(planningStageForStatus("partially_published")).toBe("publishing_setup");
    expect(planningStageForStatus("published")).toBe("published");
    expect(planningStageForStatus("blocked")).toBeNull();
    expect(planningStageForStatus("cancelled")).toBeNull();
  });
});

describe("buildPlanningPresentation", () => {
  it("projects a draft to the brief resolver and derives responsibility from workflow rules", () => {
    const result = buildPlanningPresentation({
      status: "draft",
      actorRoles: ["content_planner"],
      readiness: readiness({
        blockers: 1,
        requiredTotal: 4,
        requiredCompleted: 3,
        issues: [
          {
            path: "content.formatPayload.hook",
            code: "missing_hook",
            severity: "blocker",
            message: "Add a hook.",
          },
          {
            path: "channels[0].payload.caption",
            code: "missing_caption",
            severity: "blocker",
            message: "Add a caption.",
          },
        ],
      }),
      now: NOW,
    });

    expect(result.workflow).toMatchObject({
      internalStatus: "draft",
      stage: "planning",
      condition: "normal",
      labelKey: "contentDetail.workflow.railStageLabels.planning",
    });
    expect(result.nextAction).toMatchObject({
      type: "submit_content_review",
      headlineKey: "planning.nextAction.draft",
      destinationTab: "content",
      destinationAnchor: "brief",
      responsibleRole: "content_planner",
    });
    expect(result.readiness.currentBlockers).toHaveLength(1);
    expect(result.readiness.futureRequirements).toHaveLength(1);
    expect(result.readiness.completed).toBe(3);
    expect(result.readiness.required).toBe(4);
  });

  it("keeps blocked and cancelled items stage-less and exposes the condition resolver", () => {
    const blocked = buildPlanningPresentation({
      status: "blocked",
      actorRoles: ["workspace_manager"],
      blockedReason: "Waiting on legal approval",
      readiness: readiness(),
      now: NOW,
    });
    const cancelled = buildPlanningPresentation({
      status: "cancelled",
      actorRoles: ["workspace_manager"],
      cancellationReason: "Campaign paused",
      readiness: readiness(),
      now: NOW,
    });

    expect(blocked.workflow).toMatchObject({ stage: null, condition: "blocked" });
    expect(blocked.nextAction).toMatchObject({
      type: "unblock",
      destinationTab: "overview",
      destinationAnchor: "workflow",
      blockedReason: "Waiting on legal approval",
    });
    expect(cancelled.workflow).toMatchObject({ stage: null, condition: "cancelled" });
    expect(cancelled.nextAction).toMatchObject({
      type: "cancelled",
      destinationTab: "overview",
      destinationAnchor: "workflow",
    });
  });

  it("presents approval records as stable gate/status keys without changing authority", () => {
    const result = buildPlanningPresentation({
      status: "creative_review",
      actorRoles: ["internal_reviewer"],
      readiness: readiness({ canPublish: false }),
      approvals: [
        {
          gate: "creative_internal",
          status: "pending",
          reviewerName: "Jon Bell",
          deliveryVersionId: "version-2",
        },
      ],
      now: NOW,
    });

    expect(result.approval.creative).toMatchObject({
      gate: "creative_internal",
      state: "pending",
      gateLabelKey: "contentDetail.workflow.approvalGates.creative_internal",
      statusLabelKey: "contentDetail.workflow.approvalStatuses.pending",
      reviewerName: "Jon Bell",
      deliveryVersionId: "version-2",
    });
    expect(result.nextAction.destinationTab).toBe("overview");
    expect(result.nextAction.destinationAnchor).toBe("workflow");
  });
});
