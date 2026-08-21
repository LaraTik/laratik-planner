import { describe, expect, it } from "vitest";
import {
  calculateWorkspaceKpis,
  calculateOverviewMetrics,
  CONTENT_FORMAT_ORDER,
  CONTENT_STATUS_PIPELINE,
} from "@/lib/dashboard/kpis";

describe("workspace KPI calculation", () => {
  it("calculates delivery and target progress consistently", () => {
    const now = new Date("2026-08-19T10:00:00Z");
    const result = calculateWorkspaceKpis({
      now,
      monthlyTarget: 4,
      items: [
        { status: "draft", plannedPublishAt: new Date("2026-08-18T10:00:00Z") },
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
      { status: "draft" as const, plannedPublishAt: new Date("2026-08-18T10:00:00Z") },
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
    // 5 actionable (cancelled excluded) + 1 at risk (the overdue draft)
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

  it("lists at-risk items sorted by plannedPublishAt ascending, capped at 5", () => {
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
          status: "draft",
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
          status: "draft",
          plannedPublishAt: new Date("2026-08-08T00:00:00Z"),
          format: "static_post",
        },
        {
          status: "in_design",
          plannedPublishAt: new Date("2026-08-07T00:00:00Z"),
          format: "static_post",
        },
        {
          status: "draft",
          plannedPublishAt: new Date("2026-08-09T00:00:00Z"),
          format: "static_post",
        },
      ],
    });
    // 3 at-risk: 08-10, 08-12, 08-15, 08-08, 08-09 = 5 total. ready_to_publish
    // and 08-30 are NOT at risk. Capped at 5.
    expect(result.atRiskItems).toHaveLength(5);
    // Oldest first. The 5 at-risk items, in ascending order, are:
    // 08-07, 08-08, 08-09, 08-10, 08-12. (The 08-15 is also at risk
    // but is the 6th oldest and gets dropped by the cap.)
    const dates = result.atRiskItems.map((i) => i.plannedPublishAt.toISOString().slice(0, 10));
    expect(dates).toEqual(["2026-08-07", "2026-08-08", "2026-08-09", "2026-08-10", "2026-08-12"]);
  });

  it("re-exposes all base workspace KPIs (delegates to calculateWorkspaceKpis)", () => {
    const result = calculateOverviewMetrics({
      now: new Date("2026-08-19T10:00:00Z"),
      monthlyTarget: 4,
      items: [
        {
          status: "draft",
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
