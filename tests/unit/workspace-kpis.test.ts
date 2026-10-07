import { describe, expect, it } from "vitest";
import {
  calculateOverviewDashboardMetrics,
  calculateOverviewMetrics,
  calculateWorkspaceKpis,
  CONTENT_FORMAT_ORDER,
  CONTENT_STATUS_PIPELINE,
  riskReasonFor,
  stageForStatus,
  type DashboardItem,
} from "@/lib/dashboard/kpis";

describe("workspace KPI calculation", () => {
  it("calculates delivery and target progress consistently", () => {
    const now = new Date("2026-08-19T10:00:00Z");
    const result = calculateWorkspaceKpis({
      now,
      monthlyTarget: 4,
      items: [
        // `in_design` rather than `draft`: ADR-0006 removes drafts from the
        // at-risk count entirely, so a past-due draft is "not started", not
        // "at risk". This item has to be genuinely in flight to be at risk.
        { status: "in_design", plannedPublishAt: new Date("2026-08-18T10:00:00Z") },
        { status: "ready_to_publish", plannedPublishAt: new Date("2026-08-20T10:00:00Z") },
        { status: "published", plannedPublishAt: new Date("2026-08-10T10:00:00Z") },
        { status: "partially_published", plannedPublishAt: new Date("2026-08-19T12:00:00Z") },
      ],
    });
    expect(result).toMatchObject({
      totalIdeas: 4,
      readyToPublish: 1,
      published: 1,
      atRisk: 1,
      coveragePercent: 100,
      onTrack: false,
    });
  });

  it("does not flag completed or cancelled work as at risk", () => {
    const result = calculateWorkspaceKpis({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: null,
      items: [
        { status: "published", plannedPublishAt: new Date("2026-08-01T00:00:00Z") },
        { status: "cancelled", plannedPublishAt: new Date("2026-08-01T00:00:00Z") },
      ],
    });
    expect(result.atRisk).toBe(0);
    expect(result.coveragePercent).toBeNull();
  });

  it("does not flag a past-due draft as at risk (ADR-0006)", () => {
    const result = calculateWorkspaceKpis({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: null,
      items: [{ status: "draft", plannedPublishAt: new Date("2026-08-01T00:00:00Z") }],
    });
    expect(result.atRisk).toBe(0);
  });
});

describe("planning-page KPI metrics (needsReview / ready)", () => {
  it("counts content_review, creative_review, and changes_requested as needsReview", () => {
    const result = calculateWorkspaceKpis({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: null,
      items: [
        { status: "content_review", plannedPublishAt: new Date("2026-08-25T00:00:00Z") },
        { status: "creative_review", plannedPublishAt: new Date("2026-08-25T00:00:00Z") },
        { status: "changes_requested", plannedPublishAt: new Date("2026-08-25T00:00:00Z") },
        { status: "draft", plannedPublishAt: new Date("2026-08-25T00:00:00Z") }, // not in review
        { status: "cancelled", plannedPublishAt: new Date("2026-08-25T00:00:00Z") }, // excluded
      ],
    });
    expect(result.needsReview).toBe(3);
  });

  it("counts ready_to_publish and partially_published as ready", () => {
    const result = calculateWorkspaceKpis({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: null,
      items: [
        { status: "ready_to_publish", plannedPublishAt: new Date("2026-08-20T00:00:00Z") },
        { status: "partially_published", plannedPublishAt: new Date("2026-08-19T00:00:00Z") },
        { status: "published", plannedPublishAt: new Date("2026-08-10T00:00:00Z") }, // already published, not "ready"
        { status: "creative_review", plannedPublishAt: new Date("2026-08-20T00:00:00Z") }, // not yet ready
      ],
    });
    expect(result.ready).toBe(2);
  });

  it("planning KPIs agree with workspace KPIs (same source of truth)", () => {
    const now = new Date("2026-08-19T10:00:00Z");
    const items = [
      // Past-due and in flight → genuinely at risk. ADR-0006 means this
      // cannot be a `draft`: drafts are excluded from at-risk by design.
      { status: "in_design" as const, plannedPublishAt: new Date("2026-08-18T10:00:00Z") },
      { status: "ready_to_publish" as const, plannedPublishAt: new Date("2026-08-20T10:00:00Z") },
      { status: "content_review" as const, plannedPublishAt: new Date("2026-08-22T00:00:00Z") },
      { status: "creative_review" as const, plannedPublishAt: new Date("2026-08-23T00:00:00Z") },
      { status: "published" as const, plannedPublishAt: new Date("2026-08-10T00:00:00Z") },
      {
        status: "partially_published" as const,
        plannedPublishAt: new Date("2026-08-19T12:00:00Z"),
      },
    ];
    const result = calculateWorkspaceKpis({ now, monthlyTarget: null, items });
    // 6 actionable + 1 at risk (the overdue in-design item)
    expect(result.totalIdeas).toBe(6);
    expect(result.atRisk).toBe(1);
    expect(result.needsReview).toBe(2);
    expect(result.ready).toBe(2);
    expect(result.published).toBe(1);
  });
});

describe("calculateOverviewMetrics (workspace overview screen)", () => {
  it("returns all 8 format buckets in the canonical order, zero-filled", () => {
    const result = calculateOverviewMetrics({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: null,
      items: [
        {
          status: "draft",
          plannedPublishAt: new Date("2026-08-25T00:00:00Z"),
          format: "static_post",
        },
      ],
    });
    expect(result.formatBreakdown).toHaveLength(CONTENT_FORMAT_ORDER.length);
    expect(result.formatBreakdown.map((b) => b.format)).toEqual(CONTENT_FORMAT_ORDER);
    const staticPost = result.formatBreakdown.find((b) => b.format === "static_post");
    expect(staticPost?.count).toBe(1);
    const carousel = result.formatBreakdown.find((b) => b.format === "carousel");
    expect(carousel?.count).toBe(0);
  });

  it("excludes cancelled items from the format breakdown", () => {
    const result = calculateOverviewMetrics({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: null,
      items: [
        {
          status: "cancelled",
          plannedPublishAt: new Date("2026-08-25T00:00:00Z"),
          format: "static_post",
        },
        {
          status: "draft",
          plannedPublishAt: new Date("2026-08-25T00:00:00Z"),
          format: "short_form_video",
        },
      ],
    });
    const total = result.formatBreakdown.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(1);
  });

  it("returns all 8 status pipeline buckets in the canonical order", () => {
    const result = calculateOverviewMetrics({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: null,
      items: [],
    });
    expect(result.statusPipeline).toHaveLength(CONTENT_STATUS_PIPELINE.length);
    expect(result.statusPipeline.map((s) => s.status)).toEqual(CONTENT_STATUS_PIPELINE);
  });

  it("lists at-risk items sorted by plannedPublishAt ascending, capped at 5 (strict overdue)", () => {
    // ADR-0007 (and ADR-0006) align the overview with the planning
    // list's strict-overdue definition: past-due AND not in
    // {ready_to_publish, partially_published, published, cancelled,
    // blocked, draft}. `blocked` is its own bucket (the stacked-bar segment)
    // and the "Needs attention" list surfaces blocked items FIRST
    // regardless of overdue-day count. So in this fixture, the
    // 08-12 `blocked` row is excluded from the plain `atRiskItems`
    // helper used by the legacy at-risk-milestones card; it would
    // appear at the top of the new "Needs attention" list.
    //
    // Every past-due row below is `in_design` / `content_review` rather than
    // `draft` — that is ADR-0006 doing its job, not fixture noise.
    const result = calculateOverviewMetrics({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: null,
      items: [
        {
          status: "draft",
          plannedPublishAt: new Date("2026-08-30T00:00:00Z"),
          format: "static_post",
        }, // not at risk
        {
          status: "in_design",
          plannedPublishAt: new Date("2026-08-15T00:00:00Z"),
          format: "static_post",
        },
        {
          status: "in_design",
          plannedPublishAt: new Date("2026-08-10T00:00:00Z"),
          format: "carousel",
        },
        { status: "blocked", plannedPublishAt: new Date("2026-08-12T00:00:00Z"), format: "story" },
        {
          status: "ready_to_publish",
          plannedPublishAt: new Date("2026-08-05T00:00:00Z"),
          format: "static_post",
        }, // not at risk
        {
          status: "content_review",
          plannedPublishAt: new Date("2026-08-08T00:00:00Z"),
          format: "static_post",
        },
        {
          status: "in_design",
          plannedPublishAt: new Date("2026-08-07T00:00:00Z"),
          format: "static_post",
        },
        {
          status: "creative_review",
          plannedPublishAt: new Date("2026-08-09T00:00:00Z"),
          format: "static_post",
        },
      ],
    });
    // Strict definition: 5 past-due items NOT in
    // {ready/partially_published/published/cancelled/blocked/draft}.
    // 08-12 blocked is excluded.
    expect(result.atRiskItems).toHaveLength(5);
    // Oldest first: 08-07, 08-08, 08-09, 08-10, 08-15.
    const dates = result.atRiskItems.map((i) => i.plannedPublishAt.toISOString().slice(0, 10));
    expect(dates).toEqual(["2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-15"]);
  });

  it("re-exposes all base workspace KPIs (delegates to calculateWorkspaceKpis)", () => {
    const result = calculateOverviewMetrics({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: 4,
      items: [
        {
          status: "in_design",
          plannedPublishAt: new Date("2026-08-18T10:00:00Z"),
          format: "static_post",
        },
        {
          status: "ready_to_publish",
          plannedPublishAt: new Date("2026-08-20T10:00:00Z"),
          format: "static_post",
        },
        {
          status: "published",
          plannedPublishAt: new Date("2026-08-10T10:00:00Z"),
          format: "static_post",
        },
        {
          status: "partially_published",
          plannedPublishAt: new Date("2026-08-19T12:00:00Z"),
          format: "static_post",
        },
      ],
    });
    expect(result).toMatchObject({
      totalIdeas: 4,
      readyToPublish: 1,
      published: 1,
      atRisk: 1,
      coveragePercent: 100,
    });
  });
});

/**
 * ADR-0007 — overview dashboard math consistency. The pre-refactor
 * dashboard labelled the donut "4% AT RISK" while showing 23 at-risk
 * out of 27 total items (23/27 ≈ 85%). The 4% was actually the
 * "% completed" value, which clashed visually with the at-risk
 * count sitting in the same card. These tests pin the new
 * contract: the headline `completionPercent` is what it says on
 * the tin, the stacked-bar segments sum to 100%, and no number
 * on the dashboard can ever be visually self-contradictory.
 */
describe("calculateOverviewDashboardMetrics (ADR-0007)", () => {
  const NOW = new Date("2026-08-19T10:00:00Z");

  /**
   * The exact fixture from the audit screenshot: 27 total items,
   * 23 past-due, 1 published, the rest drafts past their date.
   * Used to pin the 4% vs 23/27 reconciliation.
   */
  const auditFixture: DashboardItem[] = [
    // 1 published (counts toward completionPercent)
    {
      id: "p1",
      title: "Already published",
      status: "published",
      format: "static_post",
      plannedPublishAt: new Date("2026-08-05T10:00:00Z"),
      updatedAt: new Date("2026-08-30T10:00:00Z"),
      ownerId: "u1",
      ownerName: "Alice",
    },
    // 23 past-due drafts
    ...Array.from({ length: 23 }, (_, i): DashboardItem => ({
      id: `d${i + 1}`,
      title: `Past-due draft ${i + 1}`,
      status: "draft",
      format: (i % 4 === 0
        ? "static_post"
        : i % 4 === 1
          ? "short_form_video"
          : i % 4 === 2
            ? "story"
            : "carousel") as DashboardItem["format"],
      plannedPublishAt: new Date(`2026-08-${String((i % 18) + 1).padStart(2, "0")}T10:00:00Z`),
      updatedAt: new Date("2026-08-30T10:00:00Z"),
      ownerId: "u1",
      ownerName: "Alice",
    })),
    // 3 future-dated items (not at risk)
    ...Array.from({ length: 3 }, (_, i): DashboardItem => ({
      id: `f${i + 1}`,
      title: `Future draft ${i + 1}`,
      status: "draft",
      format: "static_post" as const,
      plannedPublishAt: new Date(`2026-08-${String(25 + i).padStart(2, "0")}T10:00:00Z`),
      updatedAt: new Date("2026-08-30T10:00:00Z"),
      ownerId: "u1",
      ownerName: "Alice",
    })),
  ];

  it("reconciles the 4% / 23-at-risk audit screenshot: 4% is the completion rate, not the at-risk rate", () => {
    const m = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: auditFixture,
    });
    // 1 published out of 27 total → 1/27 ≈ 3.7% → 4%. This is the
    // pre-refactor "4%" — now correctly labelled "% complete".
    expect(m.completionPercent).toBe(4);

    // ADR-0006 correction. This fixture is 23 past-due DRAFTS plus 3 future
    // drafts — precisely the "at risk 23 / total 27" reading ADR-0006 was
    // written to eliminate, because it made the tile a proxy for "drafts that
    // slipped" rather than "items the team is on the hook for". So the 26
    // drafts are reported as `notStarted`, and at-risk is genuinely 0.
    expect(m.atRisk).toBe(0);
    expect(m.notStarted).toBe(26);
    expect(m.onTrack).toBe(1); // the published item
    expect(m.blocked).toBe(0);

    // The stacked-bar segments still add up to 100% — the dashboard never
    // shows contradictory numbers, now across four buckets.
    expect(m.onTrackPercent + m.atRiskPercent + m.blockedPercent + m.notStartedPercent).toBe(100);
  });

  it("stacked-bar segments are mutually exclusive and exhaustive of total", () => {
    const m = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: auditFixture,
    });
    expect(m.onTrack + m.atRisk + m.blocked + m.notStarted).toBe(m.total);
    // The percentage breakdown must agree with the counts.
    expect(m.onTrackPercent).toBe(Math.round((m.onTrack / m.total) * 100));
    expect(m.atRiskPercent).toBe(Math.round((m.atRisk / m.total) * 100));
    expect(m.blockedPercent).toBe(Math.round((m.blocked / m.total) * 100));
    expect(m.notStartedPercent).toBe(Math.round((m.notStarted / m.total) * 100));
  });

  it("excludes cancelled items from every count (actionable only)", () => {
    const items: DashboardItem[] = [
      ...auditFixture,
      {
        id: "cancel1",
        title: "Cancelled item",
        status: "cancelled",
        format: "story",
        plannedPublishAt: new Date("2026-08-01T10:00:00Z"),
        updatedAt: new Date("2026-08-30T10:00:00Z"),
        ownerId: null,
        ownerName: null,
      },
    ];
    const m = calculateOverviewDashboardMetrics({ now: NOW, monthlyTarget: null, items });
    // Total should be 27 (the cancelled item is excluded from the
    // actionable set, not the published fixture).
    expect(m.total).toBe(27);
    // And the cancelled item must not appear in needs-attention.
    expect(m.needsAttention.every((i) => i.id !== "cancel1")).toBe(true);
  });

  it("emits zero counts and 0% when the workspace is empty (no division by zero)", () => {
    const m = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: [],
    });
    expect(m.total).toBe(0);
    expect(m.completionPercent).toBe(0);
    expect(m.onTrackPercent).toBe(0);
    expect(m.atRiskPercent).toBe(0);
    expect(m.blockedPercent).toBe(0);
    expect(m.notStartedPercent).toBe(0);
    expect(m.onTrack + m.atRisk + m.blocked + m.notStarted).toBe(0);
  });

  it("returns the 4 semantic workflow stages in the canonical order", () => {
    const m = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: auditFixture,
    });
    expect(m.workflowStages.map((s) => s.stage)).toEqual([
      "planning",
      "review",
      "design",
      "publish",
    ]);
    // All 27 actionable items are in some stage; the total equals total.
    expect(m.workflowStages.reduce((s, x) => s + x.count, 0)).toBe(m.total);
  });

  it("buckets every at-risk item into exactly one risk reason (exclusive taxonomy)", () => {
    // The audit fixture cannot drive this any more: under ADR-0006 its 26
    // drafts are `notStarted`, not at risk, so it has zero at-risk items.
    // Use in-flight rows that exercise all four reasons instead.
    const m = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: [
        {
          id: "review",
          title: "Overdue awaiting review",
          status: "content_review",
          format: "story",
          plannedPublishAt: new Date("2026-08-10T10:00:00Z"),
          updatedAt: new Date("2026-08-30T10:00:00Z"),
          ownerId: "u1",
          ownerName: "Alice",
        },
        {
          id: "design",
          title: "Overdue in design",
          status: "in_design",
          format: "carousel",
          plannedPublishAt: new Date("2026-08-12T10:00:00Z"),
          updatedAt: new Date("2026-08-30T10:00:00Z"),
          ownerId: "u1",
          ownerName: "Alice",
        },
        {
          id: "creative",
          title: "Overdue awaiting creative",
          status: "creative_review",
          format: "short_form_video",
          plannedPublishAt: new Date("2026-08-14T10:00:00Z"),
          updatedAt: new Date("2026-08-30T10:00:00Z"),
          ownerId: "u1",
          ownerName: "Alice",
        },
        {
          id: "published",
          title: "Shipped",
          status: "published",
          format: "static_post",
          plannedPublishAt: new Date("2026-08-05T10:00:00Z"),
          updatedAt: new Date("2026-08-30T10:00:00Z"),
          ownerId: "u1",
          ownerName: "Alice",
        },
      ],
    });
    expect(m.atRisk).toBe(3);
    expect(m.riskReasonCounts.find((r) => r.reason === "awaiting_review")?.count).toBe(1);
    expect(m.riskReasonCounts.find((r) => r.reason === "design_in_progress")?.count).toBe(1);
    expect(m.riskReasonCounts.find((r) => r.reason === "needs_creative")?.count).toBe(1);
    // Exclusive: the reasons partition the at-risk set exactly.
    expect(m.riskReasonCounts.reduce((s, r) => s + r.count, 0)).toBe(m.atRisk);
  });

  it("surfaces blocked items FIRST in needs-attention (severity ordering)", () => {
    const items: DashboardItem[] = [
      {
        id: "d-overdue",
        title: "Long-overdue draft",
        status: "draft",
        format: "story",
        plannedPublishAt: new Date("2026-07-01T10:00:00Z"),
        updatedAt: new Date("2026-08-30T10:00:00Z"),
        ownerId: "u1",
        ownerName: "Alice",
      },
      {
        id: "blocked-recent",
        title: "Blocked last week",
        status: "blocked",
        format: "static_post",
        plannedPublishAt: new Date("2026-08-15T10:00:00Z"),
        updatedAt: new Date("2026-08-29T10:00:00Z"),
        ownerId: "u2",
        ownerName: "Bob",
      },
    ];
    const m = calculateOverviewDashboardMetrics({ now: NOW, monthlyTarget: null, items });
    expect(m.needsAttention[0]?.id).toBe("blocked-recent");
    expect(m.needsAttention[0]?.status).toBe("blocked");
  });

  it("sorts the rest of needs-attention by days-overdue descending, then date ascending", () => {
    // In-flight statuses, not drafts — ADR-0006 keeps past-due drafts out of
    // the at-risk set, so a draft-based fixture would assert nothing.
    const items: DashboardItem[] = [
      {
        id: "a-15d",
        title: "15 days overdue",
        status: "in_design",
        format: "story",
        plannedPublishAt: new Date("2026-08-04T10:00:00Z"),
        updatedAt: new Date("2026-08-30T10:00:00Z"),
        ownerId: "u1",
        ownerName: "Alice",
      },
      {
        id: "b-2d",
        title: "2 days overdue",
        status: "content_review",
        format: "story",
        plannedPublishAt: new Date("2026-08-17T10:00:00Z"),
        updatedAt: new Date("2026-08-30T10:00:00Z"),
        ownerId: "u1",
        ownerName: "Alice",
      },
      {
        id: "c-15d",
        title: "Also 15 days overdue but older",
        status: "creative_review",
        format: "story",
        plannedPublishAt: new Date("2026-08-04T09:00:00Z"),
        updatedAt: new Date("2026-08-30T10:00:00Z"),
        ownerId: "u1",
        ownerName: "Alice",
      },
    ];
    const m = calculateOverviewDashboardMetrics({ now: NOW, monthlyTarget: null, items });
    // Both 15-day items come first (sorted by date asc), then the 2-day one.
    expect(m.needsAttention.map((i) => i.id)).toEqual(["c-15d", "a-15d", "b-2d"]);
  });

  it("caps needs-attention at 5 and recently-updated at 6", () => {
    const items: DashboardItem[] = Array.from({ length: 12 }, (_, i) => ({
      id: `x${i}`,
      title: `Item ${i}`,
      // in_design, not draft: ADR-0006 means draft rows would never reach
      // needs-attention, so a draft fixture would cap nothing.
      status: "in_design" as const,
      format: "static_post" as const,
      plannedPublishAt: new Date(`2026-08-${String((i % 18) + 1).padStart(2, "0")}T10:00:00Z`),
      updatedAt: new Date(`2026-08-${String((i % 18) + 1).padStart(2, "0")}T10:00:00Z`),
      ownerId: null,
      ownerName: null,
    }));
    const m = calculateOverviewDashboardMetrics({ now: NOW, monthlyTarget: null, items });
    expect(m.needsAttention.length).toBeLessThanOrEqual(5);
    expect(m.recentlyUpdated.length).toBeLessThanOrEqual(6);
  });

  it("reports coveragePercent only when a monthly target is set, and clamps to 100", () => {
    const m1 = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: auditFixture,
    });
    expect(m1.coveragePercent).toBeNull();
    const m2 = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: 30,
      items: auditFixture,
    });
    // 27/30 = 90%
    expect(m2.coveragePercent).toBe(90);
    const m3 = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: 10,
      items: auditFixture,
    });
    // 27/10 > 100 → clamp to 100
    expect(m3.coveragePercent).toBe(100);
  });
});

describe("stageForStatus / riskReasonFor (ADR-0007)", () => {
  it("maps the 11-status enum onto 4 workflow stages used by the dashboard pipeline", () => {
    expect(stageForStatus("draft")).toBe("planning");
    expect(stageForStatus("content_review")).toBe("review");
    expect(stageForStatus("changes_requested")).toBe("review");
    expect(stageForStatus("approved_for_design")).toBe("design");
    expect(stageForStatus("in_design")).toBe("design");
    expect(stageForStatus("creative_review")).toBe("publish");
    expect(stageForStatus("ready_to_publish")).toBe("publish");
    expect(stageForStatus("partially_published")).toBe("publish");
    expect(stageForStatus("published")).toBe("publish");
    expect(stageForStatus("blocked")).toBe("planning"); // shown but as its own bucket
    expect(stageForStatus("cancelled")).toBe("planning"); // shown in planning so the bar isn't empty
  });

  it("derives a single risk reason for an item (the dashboard shows a why-at-risk breakdown)", () => {
    const now = new Date("2026-08-19T10:00:00Z");
    expect(
      riskReasonFor({
        status: "content_review",
        plannedPublishAt: new Date("2026-08-25T10:00:00Z"),
        now,
      }),
    ).toBe("awaiting_review");
    expect(
      riskReasonFor({
        status: "in_design",
        plannedPublishAt: new Date("2026-08-25T10:00:00Z"),
        now,
      }),
    ).toBe("design_in_progress");
    expect(
      riskReasonFor({
        status: "creative_review",
        plannedPublishAt: new Date("2026-08-25T10:00:00Z"),
        now,
      }),
    ).toBe("needs_creative");
    expect(
      riskReasonFor({
        status: "draft",
        plannedPublishAt: new Date("2026-08-01T10:00:00Z"),
        now,
      }),
    ).toBe("past_due");
  });
});
