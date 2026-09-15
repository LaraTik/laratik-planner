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
      type: "resolve_blocker",
      destinationTab: "content",
      destinationAnchor: "brief",
      blockedReason: "Add a hook.",
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

  it("promotes the earliest current blocker to the canonical next action", () => {
    const result = buildPlanningPresentation({
      status: "in_design",
      actorRoles: ["designer"],
      readiness: readiness({
        blockers: 1,
        requiredCompleted: 3,
        issues: [
          {
            path: "delivery.versions",
            code: "delivery_missing",
            severity: "blocker",
            message: "Create a creative delivery version.",
          },
        ],
      }),
      now: NOW,
    });

    expect(result.nextAction).toMatchObject({
      type: "resolve_blocker",
      destinationTab: "delivery",
      destinationAnchor: "delivery",
      blockedReason: "Create a creative delivery version.",
      canCurrentUserAct: true,
      executable: true,
    });
    expect(result.attention).toEqual([
      expect.objectContaining({
        severity: "blocking",
        code: "delivery_missing",
        destinationTab: "delivery",
      }),
    ]);
  });

  it("uses the explicit publishing setup action after package validation", () => {
    const result = buildPlanningPresentation({
      status: "ready_to_publish",
      actorRoles: ["publisher"],
      publishingSetupReady: false,
      readiness: readiness(),
      now: NOW,
    });

    expect(result.nextAction).toMatchObject({
      type: "mark_publishing_setup_ready",
      headlineKey: "contentDetail.publish.markPublishingSetupReady",
      destinationTab: "publishing",
      destinationAnchor: "publishing",
      canCurrentUserAct: true,
      executable: true,
    });
  });

  it("marks publishing setup complete without inventing a new persisted status", () => {
    const result = buildPlanningPresentation({
      status: "ready_to_publish",
      actorRoles: ["publisher"],
      publishingSetupReady: true,
      readiness: readiness(),
      now: NOW,
    });

    expect(result.workflow).toMatchObject({
      stage: "publishing_setup",
      substatusKey: "contentDetail.workflow.statusLabels.ready_to_publish",
      stageComplete: true,
    });
    expect(result.nextAction.type).toBe("record_published");
  });

  it("keeps an overdue date as attention rather than replacing the lifecycle transition", () => {
    const result = buildPlanningPresentation({
      status: "draft",
      actorRoles: ["content_planner"],
      plannedPublishAt: new Date("2026-09-12T12:00:00.000Z"),
      readiness: readiness(),
      now: NOW,
    });

    expect(result.nextAction.type).toBe("submit_content_review");
    expect(result.attention).toEqual([
      expect.objectContaining({
        code: "schedule_overdue",
        messageKey: "contentDetail.overview.plannedDatePassed",
        severity: "attention",
      }),
    ]);
  });
});
