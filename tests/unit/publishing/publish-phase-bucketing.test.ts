import { describe, expect, it } from "vitest";
import {
  KNOWN_BLOCKER_PATHS,
  phaseBlockerCounts,
  publishPhaseForBlockerPath,
} from "@/lib/publishing/blocker-targets";

/**
 * Phase ownership is what makes the publish stepper show real progress
 * instead of mirroring the aggregate blocker count, and it is what makes
 * a "Continue to …" action honest. Both properties fail silently if a
 * path is bucketed wrongly, so they are asserted mechanically here.
 */
describe("publishPhaseForBlockerPath", () => {
  it("routes the final-copy gate to review", () => {
    expect(publishPhaseForBlockerPath("channels[0].payload.approval.finalCopyApproved")).toBe(
      "review",
    );
  });

  it("routes accessibility, rights, privacy, and disclosures to compliance", () => {
    for (const path of [
      "channels[0].payload.altText",
      "channels[0].payload.privacy",
      "channels[0].payload.audioRightsConfirmed",
      "channels[0].payload.musicRightsConfirmed",
      "channels[0].payload.transcriptReviewed",
      "channels[0].disclosures.rightsConfirmed",
      "channels[0].disclosures.syntheticMedia",
    ]) {
      expect(publishPhaseForBlockerPath(path), path).toBe("compliance");
    }
  });

  it("routes copy, hashtags, platform text, and media to content", () => {
    for (const path of [
      "channels[0].payload.caption",
      "channels[0].payload.title",
      "channels[0].payload.pinTitle",
      "channels[0].payload.boardId",
      "channels[0].payload.coverFrame",
      "channels[0].payload.thumbnail",
      "approvedDeliveryVersion",
      "delivery.missing",
      "approvals.openCount",
    ]) {
      expect(publishPhaseForBlockerPath(path), path).toBe("content");
    }
  });

  it("routes a missing or malformed payload to destination", () => {
    // A channel with no usable payload has no content to write for yet,
    // so the block belongs to the phase that must be settled first.
    for (const path of ["channels[0].payload", "channels[0].payload.platform", "payload"]) {
      expect(publishPhaseForBlockerPath(path), path).toBe("destination");
    }
  });

  it("assigns every mapped blocker path to a phase, so no path is orphaned", () => {
    const phases = new Set(KNOWN_BLOCKER_PATHS.map((path) => publishPhaseForBlockerPath(path)));
    // Four phases exist; the map must reach at least the first three or
    // the strip would never advance past Destination.
    expect(phases.has("destination")).toBe(true);
    expect(phases.has("content")).toBe(true);
    expect(phases.has("compliance")).toBe(true);
    expect(phases.has("review")).toBe(true);
  });
});

describe("phaseBlockerCounts", () => {
  it("returns zero for every phase when there are no issues", () => {
    expect(phaseBlockerCounts([])).toEqual({
      destination: 0,
      content: 0,
      compliance: 0,
      review: 0,
    });
  });

  it("separates blockers by phase so a later phase can read as done", () => {
    // The exact state the old strip could not express: destination and
    // content settled, compliance and approval still open.
    const counts = phaseBlockerCounts([
      { path: "channels[0].payload.altText", severity: "blocker" },
      { path: "channels[0].payload.approval.finalCopyApproved", severity: "blocker" },
      { path: "channels[0].disclosures.rightsConfirmed", severity: "blocker" },
    ]);
    expect(counts).toEqual({ destination: 0, content: 0, compliance: 2, review: 1 });
  });

  it("ignores recommendations so optional polish does not block a phase", () => {
    const counts = phaseBlockerCounts([
      { path: "channels[0].disclosures.syntheticMedia", severity: "recommendation" },
    ]);
    expect(counts.compliance).toBe(0);
  });

  it("counts a channel with no payload as a destination blocker", () => {
    const counts = phaseBlockerCounts([{ path: "channels[0].payload", severity: "blocker" }]);
    expect(counts.destination).toBe(1);
    expect(counts.content).toBe(0);
  });
});
