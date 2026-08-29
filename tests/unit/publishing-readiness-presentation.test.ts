import { describe, expect, it } from "vitest";
import { presentReadinessIssues } from "@/lib/publishing/readiness-presentation";
import type { ReadinessIssue } from "@/lib/publishing/readiness";

const ISSUES: ReadinessIssue[] = [
  {
    path: "channels[0].payload.caption",
    code: "missing_caption",
    severity: "blocker",
    message: "Instagram posts require a caption.",
  },
  {
    path: "channels[0].payload.altText",
    code: "missing_alt_text",
    severity: "blocker",
    message: "Instagram posts require alt text.",
  },
  {
    path: "channels[0].approvedDeliveryVersion",
    code: "delivery_not_approved",
    severity: "blocker",
    message: "Approve a delivery version.",
  },
  {
    path: "approvals.openCount",
    code: "approvals_open",
    severity: "recommendation",
    message: "Auto-cancelled approvals need a re-review.",
  },
];

describe("presentReadinessIssues", () => {
  it("translates known codes to user-friendly titles", () => {
    const out = presentReadinessIssues([ISSUES[0]!]);
    expect(out[0]?.title).toBe("Add a caption");
  });

  it("strips the channels[N]. prefix and points to the publishing section", () => {
    const out = presentReadinessIssues([ISSUES[0]!]);
    expect(out[0]?.href).toBe("publishing");
  });

  it("maps delivery issues to the delivery section", () => {
    const out = presentReadinessIssues([ISSUES[2]!]);
    expect(out[0]?.href).toBe("delivery");
  });

  it("maps approvals issues to the workflow section", () => {
    const out = presentReadinessIssues([ISSUES[3]!]);
    expect(out[0]?.href).toBe("workflow");
  });

  it("falls back to a humanised code when the lookup misses", () => {
    const out = presentReadinessIssues([
      {
        path: "channels[0].payload.weird_thing",
        code: "weird_thing_required",
        severity: "blocker",
        message: "Some weird thing is required.",
      },
    ]);
    expect(out[0]?.title).toBe("Weird Thing Required");
  });

  it("returns the original message as the description so the planner can read the service's specific reason when needed", () => {
    const out = presentReadinessIssues([ISSUES[0]!]);
    expect(out[0]?.message).toBe("Instagram posts require a caption.");
  });
});
