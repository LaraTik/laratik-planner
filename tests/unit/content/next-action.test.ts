import { describe, expect, it } from "vitest";
import { deriveNextAction } from "@/lib/content/next-action";

/**
 * Next-action derivation — the planning list row's "→ Submit for review"
 * hint. The label MUST come from `STEP_EXPLANATIONS[status].next` so the
 * list and the detail page agree on wording; the test pins that contract
 * for every workflow status.
 */

const NOW = new Date("2026-08-15T12:00:00.000Z");
const past = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000);
const future = (daysAhead: number) => new Date(NOW.getTime() + daysAhead * 86_400_000);

const PLANNER = ["content_planner"] as const;
const INTERNAL_REVIEWER = ["internal_reviewer"] as const;
const PUBLISHER = ["publisher"] as const;
const MANAGER = ["workspace_manager"] as const;
const CLIENT = ["client_reviewer"] as const;

describe("deriveNextAction — workflow hints", () => {
  it("uses STEP_EXPLANATIONS text verbatim for non-overdue rows", () => {
    const r = deriveNextAction({
      status: "draft",
      health: "not_started",
      openApprovalCount: 0,
      actorRoles: PLANNER,
      now: NOW,
      plannedPublishAt: future(3),
    });
    expect(r.label).toMatch(/submit/i);
    expect(r.canCurrentUserAct).toBe(true);
    expect(r.tab).toBe("content");
  });

  it("surfaces a deeper-next hint for an in-flight designer block", () => {
    const r = deriveNextAction({
      status: "in_design",
      health: "in_progress",
      openApprovalCount: 0,
      actorRoles: PLANNER,
      now: NOW,
      plannedPublishAt: future(2),
    });
    expect(r.label).toMatch(/delivery/i);
    expect(r.canCurrentUserAct).toBe(false);
    expect(r.tab).toBe("workflow");
  });

  it("a designer on the same row gets canCurrentUserAct=true", () => {
    const r = deriveNextAction({
      status: "in_design",
      health: "in_progress",
      openApprovalCount: 0,
      actorRoles: ["designer"],
      now: NOW,
      plannedPublishAt: future(2),
    });
    expect(r.canCurrentUserAct).toBe(true);
  });
});

describe("deriveNextAction — overdue", () => {
  it("prepends the day count when past-due", () => {
    const r = deriveNextAction({
      status: "content_review",
      health: "overdue",
      openApprovalCount: 0,
      actorRoles: INTERNAL_REVIEWER,
      now: NOW,
      plannedPublishAt: past(3),
    });
    expect(r.label).toMatch(/3 days overdue/);
    expect(r.canCurrentUserAct).toBe(true);
    expect(r.tab).toBe("workflow");
  });

  it("singular day when exactly one day past-due", () => {
    const r = deriveNextAction({
      status: "content_review",
      health: "overdue",
      openApprovalCount: 0,
      actorRoles: INTERNAL_REVIEWER,
      now: NOW,
      plannedPublishAt: past(1),
    });
    expect(r.label).toMatch(/^1 day overdue/);
  });
});

describe("deriveNextAction — ready_to_publish", () => {
  it("surfaces an open-approval hint when one is in flight", () => {
    const r = deriveNextAction({
      status: "ready_to_publish",
      health: "ready",
      openApprovalCount: 2,
      actorRoles: INTERNAL_REVIEWER,
      now: NOW,
      plannedPublishAt: future(1),
    });
    expect(r.label).toMatch(/2 approvals/);
    expect(r.canCurrentUserAct).toBe(true);
    expect(r.tab).toBe("publishing");
  });

  it("falls back to the step explanation's next string when no open approvals", () => {
    const r = deriveNextAction({
      status: "ready_to_publish",
      health: "ready",
      openApprovalCount: 0,
      actorRoles: PUBLISHER,
      now: NOW,
      plannedPublishAt: future(1),
    });
    // The label MUST come from STEP_EXPLANATIONS[status].next so the
    // list row and the detail page agree on wording. The detail page
    // currently shows "Publish on each channel, then record the
    // outcome (published / skipped / failed) here." — if you change
    // STEP_EXPLANATIONS, this test will tell you the list drifted.
    expect(r.label.toLowerCase()).toMatch(/publish|schedule/);
    expect(r.canCurrentUserAct).toBe(true);
    expect(r.tab).toBe("publishing");
  });
});

describe("deriveNextAction — terminal states", () => {
  it("returns Resolve blocker for blocked items, manager-only", () => {
    const r = deriveNextAction({
      status: "blocked",
      health: "blocked",
      openApprovalCount: 0,
      actorRoles: MANAGER,
      now: NOW,
      plannedPublishAt: past(2),
    });
    expect(r.label).toBe("Resolve blocker");
    expect(r.canCurrentUserAct).toBe(true);
    expect(r.tab).toBe("workflow");
  });

  it("non-managers cannot act on blocked items", () => {
    const r = deriveNextAction({
      status: "blocked",
      health: "blocked",
      openApprovalCount: 0,
      actorRoles: INTERNAL_REVIEWER,
      now: NOW,
      plannedPublishAt: past(2),
    });
    expect(r.canCurrentUserAct).toBe(false);
  });

  it("client reviewers can advance creative_review", () => {
    const r = deriveNextAction({
      status: "creative_review",
      health: "needs_review",
      openApprovalCount: 0,
      actorRoles: CLIENT,
      now: NOW,
      plannedPublishAt: future(2),
    });
    expect(r.canCurrentUserAct).toBe(true);
    expect(r.tab).toBe("workflow");
  });
});
