import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCENARIO,
  DomainError,
  WORKFLOW_SCENARIOS,
  getActiveScenario,
  resolveWorkflowTransition,
  stageIncluded,
  type WorkflowScenarioId,
  type WorkspaceRole,
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
  it("skips the content-review gate when the scenario omits content_review", () => {
    // `lightweight` promises "Planning → Design → Creative approval →
    // Publishing setup → Published" with "No pre-design content
    // review". `approve_content` is the only rule that reaches
    // `approved_for_design`, so simply filtering `submit_content_review`
    // out of the table would strand every lightweight item at `draft` —
    // which ADR 0014 forbids ("a scenario switch can never trap an
    // in-flight item"). The submit action therefore lands on the next
    // spine stage instead.
    const out = resolveWorkflowTransition({
      action: "submit_content_review",
      currentStatus: "draft",
      actorRoles: ["content_planner"],
      scenario: WORKFLOW_SCENARIOS.lightweight,
    });
    expect(out.to).toBe("approved_for_design");
  });

  it("never traps an in-flight item that sits in a stage the scenario omits", () => {
    // A workspace can switch to `lightweight` while an item is in
    // `content_review` — a stage the new scenario omits. ADR 0014
    // requires that "a scenario switch can never trap an in-flight
    // item", so the item must still be FINISHABLE and still be
    // cancellable / blockable. A source-stage filter would reject
    // every action out of that status, including the escape hatches.
    const finished = resolveWorkflowTransition({
      action: "approve_content",
      currentStatus: "content_review",
      actorRoles: ["internal_reviewer"],
      scenario: WORKFLOW_SCENARIOS.lightweight,
    });
    expect(finished.to).toBe("approved_for_design");

    const cancelled = resolveWorkflowTransition({
      action: "cancel",
      currentStatus: "content_review",
      actorRoles: ["workspace_manager"],
      reason: "No longer needed",
      scenario: WORKFLOW_SCENARIOS.lightweight,
    });
    expect(cancelled.to).toBe("cancelled");

    const blocked = resolveWorkflowTransition({
      action: "block",
      currentStatus: "content_review",
      actorRoles: ["workspace_manager"],
      reason: "Waiting on the client",
      scenario: WORKFLOW_SCENARIOS.lightweight,
    });
    expect(blocked.to).toBe("blocked");
  });

  it("still refuses a move INTO a stage the scenario omits", () => {
    // The target filter is the one that matters: a transition may not
    // park an item in a gate the workspace's spine does not have.
    expect(() =>
      resolveWorkflowTransition({
        action: "submit_content_review",
        currentStatus: "draft",
        actorRoles: ["content_planner"],
        scenario: WORKFLOW_SCENARIOS.standard,
      }),
    ).not.toThrow();
    // …and a target with no bypass is refused rather than silently
    // landing somewhere else.
    expect(() =>
      resolveWorkflowTransition({
        action: "record_published",
        currentStatus: "ready_to_publish",
        actorRoles: ["publisher"],
        scenario: {
          ...WORKFLOW_SCENARIOS.lightweight,
          stages: WORKFLOW_SCENARIOS.lightweight.stages.filter((stage) => stage !== "published"),
        },
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_transition" }));
  });

  it("allows a creative-gate revision to be re-submitted under lightweight", () => {
    // `changes_requested` is a derived status: it records that work went
    // BACK to a gate, it does not own a stage. Gating it on the fixed
    // content_review mapping would make a creative revision impossible
    // to deliver in a workspace that skips content review.
    expect(() =>
      resolveWorkflowTransition({
        action: "submit_delivery",
        currentStatus: "changes_requested",
        actorRoles: ["designer"],
        scenario: WORKFLOW_SCENARIOS.lightweight,
      }),
    ).not.toThrow();
  });

  it("allows a creative-gate change request to be raised under lightweight", () => {
    expect(() =>
      resolveWorkflowTransition({
        action: "request_creative_changes",
        currentStatus: "creative_review",
        actorRoles: ["internal_reviewer"],
        reason: "off-brand",
        scenario: WORKFLOW_SCENARIOS.lightweight,
      }),
    ).not.toThrow();
  });

  it("finishes an in-flight content_review item under lightweight instead of trapping it", () => {
    // The ORIGINAL expectation here was a rejection: "status not
    // reachable". That turned out to be the trap ADR 0014 forbids —
    // a source-stage filter rejects EVERY action out of an omitted
    // stage, including `cancel` and `block`, so a workspace switched
    // to `lightweight` mid-flight would strand its items with no way
    // out. The item is now FINISHED: the content gate is skipped and
    // the item lands on the next included stage.
    const out = resolveWorkflowTransition({
      action: "approve_content",
      currentStatus: "content_review",
      actorRoles: ["internal_reviewer"],
      scenario: WORKFLOW_SCENARIOS.lightweight,
    });
    expect(out.to).toBe("approved_for_design");
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
        action: "record_published",
        currentStatus: "ready_to_publish",
        actorRoles: ["publisher"],
        scenario: {
          ...WORKFLOW_SCENARIOS.lightweight,
          stages: WORKFLOW_SCENARIOS.lightweight.stages.filter((stage) => stage !== "published"),
        },
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

describe("workflow scenarios — a scenario must never trap an item", () => {
  /**
   * ADR 0014: "Conditions (blocked, cancelled) always pass through so a
   * scenario switch can never trap an in-flight item."
   *
   * `lightweight` omits the `content_review` stage, and
   * `approve_content` is the ONLY rule that reaches
   * `approved_for_design`. If the submit action were merely REJECTED
   * under this scenario, every lightweight item would be stranded at
   * `draft` and the scenario's own promise ("Planning → Design →
   * Creative approval → Publishing setup → Published") would be
   * unreachable. The omitted stage is SKIPPED instead, so the spine
   * stays whole.
   */
  const SPINE: Array<{
    action: Parameters<typeof resolveWorkflowTransition>[0]["action"];
    from: Parameters<typeof resolveWorkflowTransition>[0]["currentStatus"];
    roles: WorkspaceRole[];
    to: string;
  }> = [
    {
      action: "submit_content_review",
      from: "draft",
      roles: ["content_planner"],
      to: "approved_for_design",
    },
    {
      action: "assign_designer",
      from: "approved_for_design",
      roles: ["workspace_manager"],
      to: "in_design",
    },
    { action: "submit_delivery", from: "in_design", roles: ["designer"], to: "creative_review" },
    {
      action: "approve_internal_creative",
      from: "creative_review",
      roles: ["internal_reviewer"],
      to: "ready_to_publish",
    },
    { action: "record_published", from: "ready_to_publish", roles: ["publisher"], to: "published" },
  ];

  it("walks the whole lightweight spine from draft to published", () => {
    for (const step of SPINE) {
      const out = resolveWorkflowTransition({
        action: step.action,
        currentStatus: step.from,
        actorRoles: step.roles,
        scenario: WORKFLOW_SCENARIOS.lightweight,
      });
      expect(out.to, `${step.action} under lightweight`).toBe(step.to);
    }
  });

  it("keeps the standard spine identical — the filter is a no-op there", () => {
    for (const step of SPINE) {
      const out = resolveWorkflowTransition({
        action: step.action,
        currentStatus: step.from,
        actorRoles: step.roles,
        scenario: WORKFLOW_SCENARIOS.standard,
      });
      // Under `standard` the content gate exists, so the submit action
      // lands in content_review; the reviewer then approves it.
      expect(out.to, `${step.action} under standard`).toBe(
        step.action === "submit_content_review" ? "content_review" : step.to,
      );
    }
  });
});
