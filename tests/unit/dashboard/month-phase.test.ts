import { describe, expect, it } from "vitest";

import {
  calculateOverviewDashboardMetrics,
  monthPhaseFor,
  type DashboardItem,
} from "@/lib/dashboard/kpis";

/**
 * Month-phase contracts for the Overview month switcher.
 *
 * The defect these pin: the Overview anchors every planning metric to
 * `?month=YYYY-MM`, but "at risk" was computed against `now` alone. That made
 * the same bar mean three different things depending on which month the
 * operator was looking at:
 *
 *   - a FUTURE month always read "100% on track" (nothing can be late yet),
 *   - a PAST month spiked toward "100% at risk" for items nobody can fix,
 *   - and an EMPTY future month rendered a page of hard zeros that looked
 *     identical to the previous empty month — indistinguishable from a broken
 *     month switcher.
 *
 * The counts themselves were never wrong, so these tests deliberately assert
 * that the ARITHMETIC is unchanged and that only the PHASE is new. If a future
 * change re-anchors the math, these tests must be updated alongside the ADR.
 */

const NOW = new Date("2026-10-07T12:00:00.000Z");

describe("monthPhaseFor", () => {
  it("classifies a month that has not started as future", () => {
    expect(
      monthPhaseFor({
        monthStart: new Date("2026-11-01T00:00:00.000Z"),
        monthEnd: new Date("2026-12-01T00:00:00.000Z"),
        now: NOW,
      }),
    ).toBe("future");
  });

  it("classifies a month that has fully elapsed as past", () => {
    expect(
      monthPhaseFor({
        monthStart: new Date("2026-08-01T00:00:00.000Z"),
        monthEnd: new Date("2026-09-01T00:00:00.000Z"),
        now: NOW,
      }),
    ).toBe("past");
  });

  it("classifies the running month as current", () => {
    expect(
      monthPhaseFor({
        monthStart: new Date("2026-10-01T00:00:00.000Z"),
        monthEnd: new Date("2026-11-01T00:00:00.000Z"),
        now: NOW,
      }),
    ).toBe("current");
  });

  it("treats monthEnd as EXCLUSIVE — a month ending exactly now is already past", () => {
    // monthEnd is the first instant of the FOLLOWING month, so equality means
    // the last millisecond of this month has already gone by. Using a strict
    // `<` here would report a just-ended month as still running.
    expect(
      monthPhaseFor({
        monthStart: new Date("2026-09-01T00:00:00.000Z"),
        monthEnd: NOW,
        now: NOW,
      }),
    ).toBe("past");
  });

  it("treats monthStart as INCLUSIVE — the first instant of a month is current, not future", () => {
    const monthStart = new Date("2026-11-01T00:00:00.000Z");
    expect(
      monthPhaseFor({
        monthStart,
        monthEnd: new Date("2026-12-01T00:00:00.000Z"),
        now: monthStart,
      }),
    ).toBe("current");
  });
});

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

describe("calculateOverviewDashboardMetrics — monthPhase", () => {
  it("defaults to 'current' so the planning list keeps its existing behaviour", () => {
    const metrics = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: [item({})],
    });
    expect(metrics.monthPhase).toBe("current");
  });

  it("echoes an explicit phase back to the caller", () => {
    for (const monthPhase of ["past", "current", "future"] as const) {
      const metrics = calculateOverviewDashboardMetrics({
        now: NOW,
        monthlyTarget: null,
        items: [item({})],
        monthPhase,
      });
      expect(metrics.monthPhase).toBe(monthPhase);
    }
  });

  it("does NOT change the counts based on phase — only the wording is phase-aware", () => {
    // This is the load-bearing assertion. A closed month legitimately has a
    // high at-risk count (those items really are past-due); the fix is to stop
    // calling that "at risk" and calling it a record. Re-anchoring the maths
    // per phase would make the number wrong instead of the label.
    const items = [
      item({
        id: "a",
        status: "content_review",
        plannedPublishAt: new Date("2026-08-10T00:00:00.000Z"),
      }),
      item({
        id: "b",
        status: "published",
        plannedPublishAt: new Date("2026-08-12T00:00:00.000Z"),
      }),
    ];

    const asPast = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: 10,
      items,
      monthPhase: "past",
    });
    const asCurrent = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: 10,
      items,
      monthPhase: "current",
    });

    expect(asPast.atRisk).toBe(asCurrent.atRisk);
    expect(asPast.onTrackPercent).toBe(asCurrent.onTrackPercent);
    expect(asPast.total).toBe(asCurrent.total);
    // The concrete finding: 1 of 2 is a past-due item awaiting review, so
    // at-risk is 50%. `content_review` rather than `draft` because ADR-0006
    // keeps drafts out of at-risk entirely.
    expect(asPast.atRisk).toBe(1);
    expect(asPast.atRiskPercent).toBe(50);
  });

  it("still reports atRisk 0 for an untouched future month — and does NOT call drafts 'on track'", () => {
    // Guards against someone 'fixing' the vacuous 100% by making the future
    // month invent risk. At-risk stays 0. And because ADR-0006 removes drafts
    // from at-risk, the two untouched drafts land in `notStarted` rather than
    // being passed off as healthy — which is precisely why
    // DeliveryHealthCard suppresses its headline percentage in this phase.
    const metrics = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: 12,
      items: [
        item({ id: "a", plannedPublishAt: new Date("2026-11-05T00:00:00.000Z") }),
        item({ id: "b", plannedPublishAt: new Date("2026-11-20T00:00:00.000Z") }),
      ],
      monthPhase: "future",
    });
    expect(metrics.atRisk).toBe(0);
    expect(metrics.onTrack).toBe(0);
    expect(metrics.notStarted).toBe(2);
    expect(metrics.notStartedPercent).toBe(100);
  });

  it("keeps the stacked segments summing to 100 for a closed month", () => {
    const metrics = calculateOverviewDashboardMetrics({
      now: NOW,
      monthlyTarget: null,
      items: [
        item({ id: "a", status: "draft", plannedPublishAt: new Date("2026-08-02T00:00:00.000Z") }),
        item({
          id: "b",
          status: "in_design",
          plannedPublishAt: new Date("2026-08-03T00:00:00.000Z"),
        }),
        item({
          id: "c",
          status: "blocked",
          plannedPublishAt: new Date("2026-08-04T00:00:00.000Z"),
        }),
        item({
          id: "d",
          status: "published",
          plannedPublishAt: new Date("2026-08-05T00:00:00.000Z"),
        }),
      ],
      monthPhase: "past",
    });
    expect(
      metrics.onTrackPercent +
        metrics.atRiskPercent +
        metrics.blockedPercent +
        metrics.notStartedPercent,
    ).toBe(100);
    expect(metrics.onTrack + metrics.atRisk + metrics.blocked + metrics.notStarted).toBe(
      metrics.total,
    );
  });
});
