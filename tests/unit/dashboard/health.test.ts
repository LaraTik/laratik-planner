import { describe, expect, it } from "vitest";
import {
  aggregateHealth,
  classifyHealth,
  daysOverdue,
  ATTENTION_HEALTHS,
  type HealthSnapshot,
} from "@/lib/dashboard/health";

/**
 * Health-rollup tests — pin the contract the Planning list and the
 * workspace KPI bar both depend on. The "23 of 27 at risk" finding
 * (planning list refactor, 2026-08-30) is the motivating test case:
 * the strict-overdue definition MUST exclude drafts so the count
 * stops being a back-of-drafts proxy. Any future change that re-adds
 * drafts to "at risk" must update these tests AND the ADR together.
 */

const NOW = new Date("2026-08-15T12:00:00.000Z");
const past = (daysAgo: number) => new Date(NOW.getTime() - daysAgo * 86_400_000);
const future = (daysAhead: number) => new Date(NOW.getTime() + daysAhead * 86_400_000);

describe("classifyHealth", () => {
  it("buckets drafts as not_started (NOT at_risk) — the core fix for the 23/27 finding", () => {
    expect(classifyHealth({ status: "draft", plannedPublishAt: past(3), now: NOW })).toBe(
      "not_started",
    );
    expect(classifyHealth({ status: "draft", plannedPublishAt: future(3), now: NOW })).toBe(
      "not_started",
    );
  });

  it("returns overdue for past-due items in a review state", () => {
    expect(classifyHealth({ status: "content_review", plannedPublishAt: past(2), now: NOW })).toBe(
      "overdue",
    );
    expect(classifyHealth({ status: "creative_review", plannedPublishAt: past(1), now: NOW })).toBe(
      "overdue",
    );
    expect(
      classifyHealth({ status: "changes_requested", plannedPublishAt: past(5), now: NOW }),
    ).toBe("overdue");
  });

  it("returns needs_review for future-dated review items", () => {
    expect(
      classifyHealth({ status: "content_review", plannedPublishAt: future(2), now: NOW }),
    ).toBe("needs_review");
  });

  it("returns ready for ready_to_publish / partially_published regardless of date", () => {
    expect(
      classifyHealth({ status: "ready_to_publish", plannedPublishAt: past(1), now: NOW }),
    ).toBe("ready");
    expect(
      classifyHealth({ status: "ready_to_publish", plannedPublishAt: future(1), now: NOW }),
    ).toBe("ready");
    expect(
      classifyHealth({ status: "partially_published", plannedPublishAt: past(1), now: NOW }),
    ).toBe("ready");
  });

  it("returns in_progress for approved_for_design / in_design, overdue if past-due", () => {
    expect(
      classifyHealth({ status: "approved_for_design", plannedPublishAt: future(1), now: NOW }),
    ).toBe("in_progress");
    expect(classifyHealth({ status: "in_design", plannedPublishAt: past(2), now: NOW })).toBe(
      "overdue",
    );
  });

  it("returns blocked / published / cancelled as terminal states", () => {
    expect(classifyHealth({ status: "blocked", plannedPublishAt: past(10), now: NOW })).toBe(
      "blocked",
    );
    expect(classifyHealth({ status: "published", plannedPublishAt: past(10), now: NOW })).toBe(
      "published",
    );
    expect(classifyHealth({ status: "cancelled", plannedPublishAt: past(10), now: NOW })).toBe(
      "cancelled",
    );
  });
});

describe("aggregateHealth", () => {
  it("computes the strict-overdue at-risk count excluding drafts", () => {
    // Reproduce the 23/27 finding: 27 total, 4 in flight past-due, 23 drafts past-due.
    // The strict-overdue definition (drafts excluded) reports at-risk = 4.
    const rows = [
      ...Array.from({ length: 23 }, () => ({
        status: "draft" as const,
        plannedPublishAt: past(3),
      })),
      ...Array.from({ length: 2 }, () => ({
        status: "content_review" as const,
        plannedPublishAt: past(2),
      })),
      ...Array.from({ length: 2 }, () => ({
        status: "in_design" as const,
        plannedPublishAt: past(1),
      })),
    ];
    const result = aggregateHealth({ rows, now: NOW });
    expect(result.total).toBe(27);
    expect(result.atRisk).toBe(4);
    expect(result.overdue).toBe(4);
    expect(result.notStarted).toBe(23);
  });

  it("includes drafts in `notStarted` so the workspace overview can show a 'Not started' tile", () => {
    const rows = [
      { status: "draft" as const, plannedPublishAt: future(2) },
      { status: "draft" as const, plannedPublishAt: past(1) },
    ];
    const result = aggregateHealth({ rows, now: NOW });
    expect(result.notStarted).toBe(2);
    expect(result.atRisk).toBe(0);
  });

  it("excludes cancelled items from the active rollup", () => {
    const rows = [
      { status: "cancelled" as const, plannedPublishAt: past(5) },
      { status: "draft" as const, plannedPublishAt: future(1) },
    ];
    const result = aggregateHealth({ rows, now: NOW });
    expect(result.total).toBe(2);
    expect(result.cancelled).toBe(1);
    expect(result.notStarted).toBe(1);
  });
});

describe("daysOverdue", () => {
  it("returns 0 for not-past-due rows", () => {
    expect(daysOverdue({ plannedPublishAt: future(1), now: NOW })).toBe(0);
    expect(daysOverdue({ plannedPublishAt: NOW, now: NOW })).toBe(0);
  });

  it("rounds down to whole days", () => {
    expect(daysOverdue({ plannedPublishAt: past(3), now: NOW })).toBe(3);
    expect(
      daysOverdue({ plannedPublishAt: new Date(NOW.getTime() - 86_400_000 - 3_600_000), now: NOW }),
    ).toBe(1);
  });
});

describe("ATTENTION_HEALTHS", () => {
  it("is the union of buckets the manager 'Needs attention' view surfaces", () => {
    const set = new Set<HealthSnapshot>(ATTENTION_HEALTHS);
    expect(set.has("at_risk")).toBe(true);
    expect(set.has("overdue")).toBe(true);
    expect(set.has("blocked")).toBe(true);
    expect(set.has("needs_review")).toBe(true);
    // Drafts and ready items are NOT in the attention view — the
    // manager wants to see what is on the team's hook, not what
    // is scheduled or done.
    expect(set.has("not_started")).toBe(false);
    expect(set.has("ready")).toBe(false);
  });
});
