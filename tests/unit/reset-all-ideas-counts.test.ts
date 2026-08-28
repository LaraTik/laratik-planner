import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Coverage for the bulk "Reset all ideas" pre-flight aggregate.
 *
 * The bulk destructive operation depends on
 * `getResetAllIdeasCounts` to show the operator exactly which
 * ideas will be deleted, broken down by status, AND how many
 * live ideas are being skipped because `includePublished` is
 * off by default. These tests pin:
 *
 *   1. Every ContentStatus is represented in `byStatus`, even
 *      when the count is zero.
 *   2. `total` matches the sum of `byStatus` values.
 *   3. `totalExcludedByDefault` is the live count when the toggle
 *      is OFF, and zero when it's ON.
 *   4. `totalLive` is always the full live count regardless of
 *      the toggle, so the dialog can show "skipping X live
 *      ideas".
 *   5. The SQL handles Postgres' jsonb envelope — both the
 *      parsed-object and raw-string forms are accepted by the
 *      byStatus parser.
 */

const executeMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: { execute: (...args: unknown[]) => executeMock(...args) },
}));

import {
  ALL_CONTENT_STATUSES,
  CONTENT_STATUS_LABELS,
  EMPTY_RESET_ALL_COUNTS,
  LIVE_STATUSES,
  getResetAllIdeasCounts,
  type ResetAllIdeasCounts,
} from "@/lib/content/reset-all-ideas";

describe("getResetAllIdeasCounts", () => {
  beforeEach(() => {
    executeMock.mockReset();
  });

  it("returns the parsed counts and excludes live ideas when the toggle is off", async () => {
    executeMock.mockResolvedValueOnce([
      {
        total_all: "20",
        total_live: "5",
        by_status: {
          draft: "8",
          content_review: "3",
          in_design: "2",
          blocked: "1",
          cancelled: "1",
        },
      },
    ]);
    const counts = await getResetAllIdeasCounts("ws-1", false);
    expect(counts.total).toBe(15);
    expect(counts.totalAllIdeas).toBe(20);
    expect(counts.totalLive).toBe(5);
    expect(counts.totalExcludedByDefault).toBe(5);
    expect(counts.byStatus.draft).toBe(8);
    expect(counts.byStatus.content_review).toBe(3);
    expect(counts.byStatus.in_design).toBe(2);
    expect(counts.byStatus.blocked).toBe(1);
    expect(counts.byStatus.cancelled).toBe(1);
    // Live statuses are zeroed because includePublished=false.
    expect(counts.byStatus.published).toBe(0);
    expect(counts.byStatus.partially_published).toBe(0);
  });

  it("includes live ideas in the count when the toggle is on", async () => {
    executeMock.mockResolvedValueOnce([
      {
        total_all: "20",
        total_live: "5",
        by_status: {
          draft: "8",
          content_review: "3",
          in_design: "2",
          blocked: "1",
          cancelled: "1",
          published: "4",
          partially_published: "1",
        },
      },
    ]);
    const counts = await getResetAllIdeasCounts("ws-1", true);
    expect(counts.total).toBe(20);
    expect(counts.totalAllIdeas).toBe(20);
    expect(counts.totalLive).toBe(5);
    expect(counts.totalExcludedByDefault).toBe(0);
    expect(counts.byStatus.published).toBe(4);
    expect(counts.byStatus.partially_published).toBe(1);
  });

  it("parses the jsonb_agg result when Postgres returns it as a JSON string", async () => {
    executeMock.mockResolvedValueOnce([
      {
        total_all: "3",
        total_live: "0",
        by_status: JSON.stringify({ draft: "2", blocked: "1" }),
      },
    ]);
    const counts = await getResetAllIdeasCounts("ws-1", false);
    expect(counts.total).toBe(3);
    expect(counts.byStatus.draft).toBe(2);
    expect(counts.byStatus.blocked).toBe(1);
  });

  it("fills missing statuses with zero in byStatus", async () => {
    executeMock.mockResolvedValueOnce([
      {
        total_all: "1",
        total_live: "0",
        by_status: { draft: "1" },
      },
    ]);
    const counts = await getResetAllIdeasCounts("ws-1", false);
    // The non-draft statuses must be zeroed by the parser.
    for (const status of ALL_CONTENT_STATUSES) {
      if (status === "draft") continue;
      expect(counts.byStatus[status]).toBe(0);
    }
    // Then confirm the single non-zero entry survived the round-trip.
    expect(counts.byStatus.draft).toBe(1);
  });

  it("returns EMPTY_RESET_ALL_COUNTS when the aggregate returns no rows", async () => {
    executeMock.mockResolvedValueOnce([]);
    const counts = await getResetAllIdeasCounts("ws-missing", false);
    expect(counts).toEqual(EMPTY_RESET_ALL_COUNTS);
  });
});

describe("LIVE_STATUSES", () => {
  it("includes both published and partially_published", () => {
    expect(LIVE_STATUSES).toContain("published");
    expect(LIVE_STATUSES).toContain("partially_published");
    // The other 9 statuses are not live.
    expect(LIVE_STATUSES).toHaveLength(2);
  });
});

describe("CONTENT_STATUS_LABELS", () => {
  it("has a non-empty human label for every ContentStatus", () => {
    for (const status of ALL_CONTENT_STATUSES) {
      expect(CONTENT_STATUS_LABELS[status].length).toBeGreaterThan(0);
    }
  });
});

describe("EMPTY_RESET_ALL_COUNTS", () => {
  it("is well-formed (every status is zero)", () => {
    const counts: ResetAllIdeasCounts = EMPTY_RESET_ALL_COUNTS;
    for (const status of ALL_CONTENT_STATUSES) {
      expect(counts.byStatus[status]).toBe(0);
    }
    expect(counts.total).toBe(0);
    expect(counts.totalAllIdeas).toBe(0);
    expect(counts.totalLive).toBe(0);
    expect(counts.totalExcludedByDefault).toBe(0);
  });
});
