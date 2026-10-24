import { beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: dbMock }));

import { loadPlatformOverviewData } from "@/features/platform/overview/server";

function makeChain(terminal: unknown) {
  const target: Record<string, unknown> = {};
  const proxy = new Proxy(target, {
    get(_target, property) {
      if (property === "then") {
        return (onFulfilled?: (value: unknown) => unknown) =>
          Promise.resolve(terminal).then(onFulfilled);
      }
      return () => proxy;
    },
  });
  return proxy;
}

function queueResults(results: unknown[][]) {
  for (const result of results) {
    dbMock.select.mockReturnValueOnce(makeChain(result));
  }
}

describe("platform overview query", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero totals and no agencies for an empty platform", async () => {
    queueResults([[], [], [], [], []]);

    await expect(loadPlatformOverviewData()).resolves.toEqual({
      kpis: {
        totalAgencies: 0,
        totalActiveUsers: 0,
        totalWorkspaces: 0,
        totalAiCalls: 0,
      },
      recentAgencies: [],
    });
    expect(dbMock.select).toHaveBeenCalledTimes(5);
  });

  it("maps aggregate totals and only the agency fields displayed by the list", async () => {
    queueResults([
      [{ value: 3 }],
      [{ value: 7 }],
      [{ value: 5 }],
      [{ value: 11 }],
      [{ id: "agency-1", name: "Northwind", slug: "northwind" }],
    ]);

    await expect(loadPlatformOverviewData()).resolves.toEqual({
      kpis: {
        totalAgencies: 3,
        totalActiveUsers: 7,
        totalWorkspaces: 5,
        totalAiCalls: 11,
      },
      recentAgencies: [{ id: "agency-1", name: "Northwind", slug: "northwind" }],
    });
    expect(dbMock.select).toHaveBeenCalledTimes(5);
  });
});
