import { describe, expect, it } from "vitest";

import {
  calculateOverviewDashboardMetrics,
  calculateOverviewMetrics,
  calculateWorkspaceKpis,
  type DashboardItem,
} from "@/lib/dashboard/kpis";
import { aggregateHealth } from "@/lib/dashboard/health";

/**
 * ADR-0006 — drafts must never count as "at risk".
 *
 * ADR-0006 exists because the Overview reported "at risk: 23 / total: 27" for
 * a month that was mostly a back-of-drafts. It settled on strict-overdue
 * semantics:
 *
 *   At risk = plannedPublishAt < now AND status NOT IN
 *             {ready_to_publish, partially_published, published,
 *              cancelled, blocked, draft}
 *
 * and listed "workspace overview KPI tile" in its explicit SCOPE. Drafts are
 * surfaced through a separate `notStarted` count instead.
 *
 * `lib/dashboard/health.ts` honours that contract and is the documented single
 * source of truth. `lib/dashboard/kpis.ts` did NOT — its NOT_AT_RISK set
 * omitted `draft`, so the Overview counted past-due drafts as at risk while the
 * Planning list filtered them out. Same month, two different at-risk numbers on
 * two screens the operator is told to trust together.
 *
 * These tests pin the corrected contract AND assert that both modules now agree
 * for the same input, which is the property that actually broke.
 */

const NOW = new Date("2026-10-07T12:00:00.000Z");
const past = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000);

/** The ADR's motivating shape: a month that is mostly slipped drafts. */
const BACK_OF_DRAFTS = [
  { status: "draft", plannedPublishAt: past(5) },
  { status: "draft", plannedPublishAt: past(4) },
  { status: "draft", plannedPublishAt: past(3) },
  { status: "draft", plannedPublishAt: past(2) },
  { status: "draft", plannedPublishAt: past(1) },
  { status: "in_design", plannedPublishAt: past(3) },
  { status: "content_review", plannedPublishAt: past(2) },
] as const;

describe("ADR-0006 — drafts are excluded from at risk", () => {
  it("calculateWorkspaceKpis does not count a past-due draft as at risk", () => {
    const kpis = calculateWorkspaceKpis({
      now: NOW,
      monthlyTarget: null,
      items: BACK_OF_DRAFTS.map((i) => ({ ...i })),
    });
    // 5 slipped drafts + 2 genuinely in-flight past-due items.
    expect(kpis.atRisk).toBe(2);
  });

  it("calculateOverviewMetrics does not count a past-due draft as at risk", () => {
    const metrics = calculateOverviewMetrics({
      now: NOW,
      monthlyTarget: null,
      items: BACK_OF_DRAFTS.map((i) => ({ ...i, format: "static_post" as const })),
    });
    expect(metrics.atRisk).toBe(2);
    expect(metrics.atRiskItems).toHaveLength(2);
  });

  it("calculateOverviewDashboardMetrics does not count a past-due draft as at risk", () => {
    const dashboard = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: BACK_OF_DRAFTS.map((i, idx) => ({
        id: `ci_${idx}`,
        title: `Item ${idx}`,
        format: "static_post" as const,
        updatedAt: NOW,
        ownerId: null,
        ownerName: null,
        ...i,
      })),
    });
    expect(dashboard.atRisk).toBe(2);
    expect(dashboard.notStarted).toBe(5);
  });
});

describe("ADR-0006 — the Overview and the Planning list now agree", () => {
  it("produces the same at-risk count from both rollups for the same rows", () => {
    const rows = BACK_OF_DRAFTS.map((i) => ({ ...i }));

    const health = aggregateHealth({ rows, now: NOW });
    const overview = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: rows.map((i, idx) => ({
        id: `ci_${idx}`,
        title: `Item ${idx}`,
        format: "static_post" as const,
        updatedAt: NOW,
        ownerId: null,
        ownerName: null,
        ...i,
      })),
    });

    expect(overview.atRisk).toBe(health.atRisk);
    expect(overview.notStarted).toBe(health.notStarted);
    expect(overview.blocked).toBe(health.blocked);
  });
});

describe("ADR-0006 — the stacked health bar still sums to total", () => {
  const item = (over: Partial<DashboardItem>): DashboardItem => ({
    id: "ci_1",
    title: "Item",
    status: "draft",
    format: "static_post",
    plannedPublishAt: NOW,
    updatedAt: NOW,
    ownerId: null,
    ownerName: null,
    ...over,
  });

  it("assigns every actionable item to exactly one of the four buckets", () => {
    const dashboard = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: [
        item({ id: "a", status: "draft", plannedPublishAt: past(5) }),
        item({ id: "b", status: "content_review", plannedPublishAt: past(3) }),
        item({ id: "c", status: "in_design", plannedPublishAt: past(2) }),
        item({ id: "d", status: "blocked", plannedPublishAt: past(1) }),
        item({ id: "e", status: "published", plannedPublishAt: past(9) }),
        item({ id: "f", status: "draft", plannedPublishAt: new Date("2026-10-25T00:00:00.000Z") }),
      ],
    });

    // Without the draft carve-out, the slipped draft would land in "at risk"
    // and the bar would over-report risk. With it, drafts get their own
    // bucket and the totals still reconcile exactly.
    expect(dashboard.notStarted).toBe(2);
    expect(dashboard.atRisk).toBe(2);
    expect(dashboard.blocked).toBe(1);
    expect(dashboard.published).toBe(1);
    expect(dashboard.onTrack + dashboard.atRisk + dashboard.blocked + dashboard.notStarted).toBe(
      dashboard.total,
    );
  });

  it("still sums to 100 when percentages are used", () => {
    const dashboard = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: [
        item({ id: "a", status: "draft", plannedPublishAt: past(5) }),
        item({ id: "b", status: "content_review", plannedPublishAt: past(3) }),
        item({ id: "c", status: "blocked", plannedPublishAt: past(1) }),
        item({ id: "d", status: "published", plannedPublishAt: past(9) }),
      ],
    });
    expect(
      dashboard.onTrackPercent +
        dashboard.atRiskPercent +
        dashboard.blockedPercent +
        dashboard.notStartedPercent,
    ).toBe(100);
  });

  it("leaves on-track items untouched — a future in-flight item is still on track", () => {
    const dashboard = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: [
        item({
          id: "a",
          status: "in_design",
          plannedPublishAt: new Date("2026-10-25T00:00:00.000Z"),
        }),
        item({ id: "b", status: "draft", plannedPublishAt: new Date("2026-10-26T00:00:00.000Z") }),
      ],
    });
    // The future in-design item is genuinely on track. The future draft is
    // NOT at risk (it is not late) but is also not "on track" — it has not
    // started, which is the distinction the fourth bucket exists to carry.
    expect(dashboard.onTrack).toBe(1);
    expect(dashboard.notStarted).toBe(1);
    expect(dashboard.atRisk).toBe(0);
    expect(dashboard.onTrack + dashboard.notStarted + dashboard.atRisk).toBe(dashboard.total);
  });
});
