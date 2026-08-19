import { describe, expect, it } from "vitest";
import { calculateWorkspaceKpis } from "@/lib/dashboard/kpis";

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
