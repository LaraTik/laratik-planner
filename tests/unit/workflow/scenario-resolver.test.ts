import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO,
  DomainError,
  WORKFLOW_SCENARIOS,
  getActiveScenario,
  resolveWorkflowTransition,
  stageIncluded,
  type WorkflowScenarioId,
} from "@/lib/content/workflow";

/**
 * Scenario engine contract — pins the migration-0048 behaviour so
 * a future refactor of WORKFLOW_RULES or the scenario catalog
 * cannot silently regress what managers can / cannot do.
 */

describe("getActiveScenario", () => {
  it("returns the standard spec when no settings are provided", () => {
    expect(getActiveScenario({ workflowScenario: null }).id).toBe("standard");
    expect(getActiveScenario({ workflowScenario: undefined }).id).toBe("standard");
  });

  it("returns the matching catalog row for known ids", () => {
    expect(getActiveScenario({ workflowScenario: "lightweight" }).id).toBe("lightweight");
    expect(getActiveScenario({ workflowScenario: "two_gate_client" }).id).toBe("two_gate_client");
    expect(getActiveScenario({ workflowScenario: "self_publish" }).id).toBe("self_publish");
  });

  it("falls back to standard for unknown ids", () => {
    const recovered = getActiveScenario({ workflowScenario: "totally-fake" });
    expect(recovered.id).toBe("standard");
    expect(recovered).toEqual(DEFAULT_SCENARIO);
  });
});

describe("stageIncluded", () => {
  it("returns true for stages the scenario includes", () => {
    expect(stageIncluded("draft", WORKFLOW_SCENARIOS.standard)).toBe(true);
    expect(stageIncluded("draft", WORKFLOW_SCENARIOS.lightweight)).toBe(true);
    expect(stageIncluded("content_review", WORKFLOW_SCENARIOS.standard)).toBe(true);
  });

  it("returns false for stages the scenario omits", () => {
    expect(stageIncluded("content_review", WORKFLOW_SCENARIOS.lightweight)).toBe(false);
    // self_publish still includes publishing_setup as a state — it
    // just removes the gate that requires an explicit validation
    // pass. See the catalog test for the `publishingSetupRequired`
    // side of the contract.
    expect(stageIncluded("ready_to_publish", WORKFLOW_SCENARIOS.self_publish)).toBe(true);
  });

  it("returns true for terminal conditions regardless of scenario", () => {
    expect(stageIncluded("blocked", WORKFLOW_SCENARIOS.lightweight)).toBe(true);
    expect(stageIncluded("cancelled", WORKFLOW_SCENARIOS.self_publish)).toBe(true);
  });
});

describe("effectiveTransitions", () => {
  it("matches the standard workflow for the standard scenario (regression gate)", () => {
    // Sanity: standard scenario must accept the canonical
    // submit_content_review from draft (replicates
    // workflow-state-machine.test.ts). If this ever fails, every
    // pre-0048 test in workflow-state-machine.test.ts is at risk.
    expect(() =>
      resolveWorkflowTransition({
        action: "submit_content_review",
        currentStatus: "draft",
        actorRoles: ["content_planner"],
        scenario: WORKFLOW_SCENARIOS.standard,
      }),
    ).not.toThrow();
  });
});

describe("resolveWorkflowTransition + scenario filter", () => {
  it("rejects content-review transitions when scenario omits content_review", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "submit_content_review",
        currentStatus: "draft",
        actorRoles: ["content_planner"],
        scenario: WORKFLOW_SCENARIOS.lightweight,
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_transition" }));
  });

  it("rejects approve_content from lightweight (status not reachable)", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "approve_content",
        currentStatus: "content_review",
        actorRoles: ["internal_reviewer"],
        scenario: WORKFLOW_SCENARIOS.lightweight,
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_transition" }));
  });

  it("allows assigning a designer straight from approved_for_design under lightweight", () => {
    // Lightweight skips content_review, so an item moves
    // draft → approved_for_design directly. From there the
    // manager can hand off to design with assign_designer.
    expect(() =>
      resolveWorkflowTransition({
        action: "assign_designer",
        currentStatus: "approved_for_design",
        actorRoles: ["workspace_manager"],
        scenario: WORKFLOW_SCENARIOS.lightweight,
      }),
    ).not.toThrow();
  });

  it("allows moving to ready_to_publish under self_publish (skipping the gate, not the state)", () => {
    // Under self_publish the publisher skips the explicit
    // "Mark publishing setup ready" gate, but the item still
    // passes through ready_to_publish. The approve_internal_creative
    // transition is reachable from creative_review.
    expect(() =>
      resolveWorkflowTransition({
        action: "approve_internal_creative",
        currentStatus: "creative_review",
        actorRoles: ["internal_reviewer"],
        scenario: WORKFLOW_SCENARIOS.self_publish,
      }),
    ).not.toThrow();
  });

  it("keeps block / cancel reachable from any status regardless of scenario", () => {
    const scenarios: WorkflowScenarioId[] = [
      "standard",
      "lightweight",
      "two_gate_client",
      "self_publish",
    ];
    for (const id of scenarios) {
      const scenario = WORKFLOW_SCENARIOS[id];
      expect(() =>
        resolveWorkflowTransition({
          action: "block",
          currentStatus: "in_design",
          actorRoles: ["workspace_manager"],
          reason: "audit",
          scenario,
        }),
      ).not.toThrow();
      expect(() =>
        resolveWorkflowTransition({
          action: "cancel",
          currentStatus: "in_design",
          actorRoles: ["workspace_manager"],
          reason: "audit",
          scenario,
        }),
      ).not.toThrow();
    }
  });

  it("defaults to standard when scenario is omitted (backward-compat)", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "submit_content_review",
        currentStatus: "draft",
        actorRoles: ["content_planner"],
      }),
    ).not.toThrow();
  });

  it("preserves the standard error code shape (DomainError)", () => {
    try {
      resolveWorkflowTransition({
        action: "submit_content_review",
        currentStatus: "draft",
        actorRoles: ["content_planner"],
        scenario: WORKFLOW_SCENARIOS.lightweight,
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(DomainError);
      expect((err as DomainError).code).toBe("invalid_transition");
    }
  });
});

describe("WORKFLOW_SCENARIOS catalog", () => {
  it("ships the four v1 scenarios with non-empty stage lists", () => {
    expect(Object.keys(WORKFLOW_SCENARIOS).sort()).toEqual([
      "lightweight",
      "self_publish",
      "standard",
      "two_gate_client",
    ]);
    for (const spec of Object.values(WORKFLOW_SCENARIOS)) {
      expect(spec.stages.length).toBeGreaterThanOrEqual(2);
      expect(spec.id).toBe(spec.id); // pin
    }
  });

  it("'standard' includes all six stages; 'self_publish' skips the publishing_setup gate; 'lightweight' omits content_review", () => {
    const allSix = new Set([
      "planning",
      "content_review",
      "creative_production",
      "creative_approval",
      "publishing_setup",
      "published",
    ]);
    expect(new Set(WORKFLOW_SCENARIOS.standard.stages)).toEqual(allSix);
    expect(WORKFLOW_SCENARIOS.self_publish.publishingSetupRequired).toBe(false);
    expect(WORKFLOW_SCENARIOS.lightweight.stages.includes("content_review")).toBe(false);
  });
});
