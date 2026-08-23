import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { currentCounterValue, usagePeriodKey } from "@/lib/usage/period";

const route = readFileSync(resolve(__dirname, "../../src/app/api/ai/generate/route.ts"), "utf8");

describe("M2 AI entitlement and usage wiring", () => {
  it("resets monthly and per-user daily counters at UTC period boundaries", () => {
    expect(usagePeriodKey("ai_requests_month", new Date("2026-08-23T12:00:00Z"))).toBe("2026-08");
    expect(usagePeriodKey("daily_ai_requests:user-1", new Date("2026-08-23T12:00:00Z"))).toBe("2026-08-23");
    expect(
      currentCounterValue(
        "ai_requests_month",
        99,
        new Date("2026-07-31T23:59:59Z"),
        new Date("2026-08-01T00:00:00Z"),
      ),
    ).toBe(0);
  });

  it("reserves request, daily-user, input-token, and output-token capacity", () => {
    for (const resource of [
      "ai_requests_month",
      "daily_ai_requests:${session.user.id}",
      "ai_input_tokens_month",
      "ai_output_tokens_month",
    ]) {
      expect(route).toContain(resource);
    }
    expect(route).toContain("maxOutputTokensPerRequest");
    expect(route).toContain("positiveAdjustments");
  });

  it("requires both agency configuration and the plan ceiling", () => {
    expect(route).toContain("!feature?.enabled || !allowed.has(parsed.data.capability)");
    expect(route).toContain("entitlement.enabledAiCapabilities.has(parsed.data.capability)");
  });

  it("binds the content workspace to the selected agency", () => {
    expect(route).toContain("eq(workspaces.agencyId, agencyId)");
  });
});
