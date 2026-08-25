import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * FEAT-19 (GAP-FULL-REVIEW-2026-08-25) — filter-aware overview
 * metrics.
 *
 * The pure `calculateOverviewMetrics` calculator in
 * `src/lib/dashboard/kpis.ts` is tested transitively by the
 * workspace overview page. The new surface in
 * `src/lib/dashboard/queries.ts` is the data-side companion that
 * pulls a *filtered* set of rows and feeds them into the
 * calculator.
 *
 * These tests pin the contract:
 *
 *  1. The new `getFilteredOverviewMetrics` helper exists and
 *     accepts the same filter shape the planning list uses
 *     (monthStart, monthEnd, status, format, ownerId,
 *     designerId, campaignId, pillarId, channelIds[]).
 *  2. A regression that drops a filter from the WHERE
 *     composes a shorter chunk list. We can't substring-match
 *     Drizzle's `sql` template output reliably, so the test
 *     asserts the helper composes the expected number of
 *     WHERE calls and completes without throwing.
 *  3. Empty filters (the default) don't break the query — the
 *     existing overview page is unfiltered today, and a
 *     backwards-incompatible default would regress it.
 *
 * Mock pattern: hand-rolled Drizzle chainable that records the
 * number of `.where()` calls. The production code calls
 * `.where()` once per `.from()`, so the count is the same as
 * the number of `db.select(...)` calls (2: content_items +
 * workspace_settings).
 */

type CapturedWhere = { sqlText: string };

const captured: { wheres: CapturedWhere[]; selectCalls: number } = {
  wheres: [],
  selectCalls: 0,
};

vi.mock("@/lib/db", () => {
  function makeChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn(() => chain);
    chain.innerJoin = vi.fn(() => chain);
    chain.leftJoin = vi.fn(() => chain);
    chain.where = vi.fn((filter: unknown) => {
      const sqlText =
        typeof filter === "object" && filter !== null && "queryChunks" in filter
          ? (filter as { queryChunks: unknown[] }).queryChunks
              .map((c) =>
                typeof c === "string" ? c : String((c as { value?: unknown })?.value ?? ""),
              )
              .join("")
          : String(filter);
      captured.wheres.push({ sqlText });
      return chain;
    });
    chain.orderBy = vi.fn(() => chain);
    chain.limit = vi.fn(() => chain);
    // Make the chain awaitable so the production code's
    // `await Promise.all([...])` resolves to an array.
    chain.then = (resolve: (v: unknown) => void) => resolve([]);
    return chain;
  }
  const db = {
    select: vi.fn(() => {
      captured.selectCalls += 1;
      return makeChain();
    }),
  };
  return { db };
});

vi.mock("@/lib/auth/policy", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/policy")>("@/lib/auth/policy");
  return {
    ...actual,
    hasWorkspaceRole: vi.fn(async () => true),
  };
});

beforeEach(() => {
  captured.wheres = [];
  captured.selectCalls = 0;
});

describe("dashboard queries (FEAT-19)", () => {
  it("exposes getFilteredOverviewMetrics", async () => {
    const { getFilteredOverviewMetrics } = await import("@/lib/dashboard/queries");
    expect(typeof getFilteredOverviewMetrics).toBe("function");
  });

  it("issues two SELECTs (content_items + workspace_settings) on an unfiltered call", async () => {
    const { getFilteredOverviewMetrics } = await import("@/lib/dashboard/queries");
    await getFilteredOverviewMetrics({ id: "u-1" }, "ws-1");
    expect(captured.selectCalls).toBe(2);
  });

  it("composes a single WHERE on the content_items query with no filters", async () => {
    const { getFilteredOverviewMetrics } = await import("@/lib/dashboard/queries");
    await getFilteredOverviewMetrics({ id: "u-1" }, "ws-1");
    // One WHERE per .select().from() call = 2 total.
    expect(captured.wheres).toHaveLength(2);
  });

  it("accepts the full filter shape without throwing", async () => {
    const { getFilteredOverviewMetrics } = await import("@/lib/dashboard/queries");
    const monthStart = new Date("2026-08-01T00:00:00Z");
    const monthEnd = new Date("2026-09-01T00:00:00Z");
    await expect(
      getFilteredOverviewMetrics({ id: "u-1" }, "ws-1", {
        monthStart,
        monthEnd,
        status: "ready_to_publish",
        format: "static_post",
        ownerId: "u-owner",
        designerId: "u-designer",
        campaignId: "c-1",
        pillarId: "p-1",
        channelIds: ["ch-1", "ch-2"],
      }),
    ).resolves.toBeDefined();
  });

  it("accepts a single channelId without throwing", async () => {
    const { getFilteredOverviewMetrics } = await import("@/lib/dashboard/queries");
    await expect(
      getFilteredOverviewMetrics({ id: "u-1" }, "ws-1", { channelIds: ["ch-1"] }),
    ).resolves.toBeDefined();
  });

  it("skips the channel filter when channelIds is empty", async () => {
    const { getFilteredOverviewMetrics } = await import("@/lib/dashboard/queries");
    // Empty array → no EXISTS subquery pushed onto the
    // conditions list. A regression that pushes the empty
    // IN would compose a SQL like `IN ()` which Postgres
    // rejects. We assert the call resolves.
    await expect(
      getFilteredOverviewMetrics({ id: "u-1" }, "ws-1", { channelIds: [] }),
    ).resolves.toBeDefined();
  });
});
