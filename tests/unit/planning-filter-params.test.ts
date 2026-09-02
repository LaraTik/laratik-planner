import { describe, expect, it } from "vitest";
import { parsePlanningFilterParams } from "@/lib/planning/filter-params";

const ownerId = "11111111-1111-4111-8111-111111111111";
const channelId = "22222222-2222-4222-8222-222222222222";

describe("parsePlanningFilterParams", () => {
  it("parses every supported planning filter and trims search text", () => {
    expect(
      parsePlanningFilterParams({
        status: "content_review",
        format: "carousel",
        stage: "approved_for_design",
        owner: ownerId,
        channel: channelId,
        health: "needs_review",
        risk: "at_risk",
        density: "compact",
        search: "  spring launch  ",
      }),
    ).toEqual({
      status: "content_review",
      format: "carousel",
      stage: "approved_for_design",
      ownerId,
      channelId,
      healthIn: ["needs_review"],
      risk: "at_risk",
      density: "compact",
      searchTerm: "spring launch",
    });
  });

  it("ignores invalid enum and identifier values instead of widening the query", () => {
    expect(
      parsePlanningFilterParams({
        status: "not-a-status",
        format: "not-a-format",
        stage: "not-a-stage",
        owner: "not-a-uuid",
        channel: "not-a-uuid",
        health: "not-a-health",
        risk: "behind",
        density: "spacious",
        search: "   ",
      }),
    ).toEqual({ density: "comfortable" });
  });

  it("accepts the health buckets exposed by the planning toolbar", () => {
    expect(parsePlanningFilterParams({ health: "ready" }).healthIn).toEqual(["ready"]);
    expect(parsePlanningFilterParams({ health: "not_started" }).healthIn).toEqual(["not_started"]);
    expect(parsePlanningFilterParams({ health: "scheduled" }).healthIn).toEqual(["scheduled"]);
  });
});
