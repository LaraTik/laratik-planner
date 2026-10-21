import { describe, expect, it } from "vitest";
import {
  DEFAULT_LEAD_TIMES,
  hasCustomLeadTimes,
} from "@/app/(app)/app/a/[agencySlug]/w/[slug]/settings/_lib/lead-times";

describe("workspace settings lead-time checklist", () => {
  it("treats the default schedule as not yet customized", () => {
    expect(hasCustomLeadTimes(DEFAULT_LEAD_TIMES)).toBe(false);
  });

  it("detects a customized schedule even when its total remains 18 days", () => {
    expect(
      hasCustomLeadTimes({
        ...DEFAULT_LEAD_TIMES,
        contentApprovalLeadDays: 9,
        designCompleteLeadDays: 6,
      }),
    ).toBe(true);
  });

  it("detects customized schedules with a different total", () => {
    expect(
      hasCustomLeadTimes({
        ...DEFAULT_LEAD_TIMES,
        readyToPublishLeadDays: 3,
      }),
    ).toBe(true);
  });
});
