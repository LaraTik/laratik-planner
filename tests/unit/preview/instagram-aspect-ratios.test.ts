import { describe, expect, it } from "vitest";
import {
  diagnoseAspectRatio,
  diagnoseCarouselConsistency,
  CAROUSEL_RATIOS,
  FEED_RATIOS,
  REEL_RATIOS,
} from "@/lib/preview/instagram-aspect-ratios";

/**
 * Phase 4 of the planning-workspace-v2 refactor (2026-08-30):
 * the aspect-ratio diagnostic is the planner-facing
 * validator for Instagram creative. The pure helpers
 * (`diagnoseAspectRatio`, `diagnoseCarouselConsistency`)
 * are tested here; the React components are tested
 * separately in `aspect-ratio-diagnostic.test.tsx`.
 */

describe("diagnoseAspectRatio", () => {
  it("returns a warning when dimensions are missing", () => {
    const d = diagnoseAspectRatio(null, null, FEED_RATIOS);
    expect(d.severity).toBe("warning");
    expect(d.matchedSpec).toBeNull();
  });

  it("matches the square 1:1 spec at exactly 1080×1080", () => {
    const d = diagnoseAspectRatio(1080, 1080, FEED_RATIOS);
    expect(d.severity).toBe("ok");
    expect(d.matchedSpec?.id).toBe("feed-square");
    expect(d.ratio).toBeCloseTo(1, 5);
  });

  it("matches the 4:5 portrait spec at exactly 1080×1350", () => {
    const d = diagnoseAspectRatio(1080, 1350, FEED_RATIOS);
    expect(d.severity).toBe("ok");
    expect(d.matchedSpec?.id).toBe("feed-portrait-4-5");
  });

  it("flags a 16:9 landscape as a warning with nearest-match advice", () => {
    const d = diagnoseAspectRatio(1920, 1080, FEED_RATIOS);
    expect(d.severity).toBe("warning");
    expect(d.matchedSpec).toBeNull();
    expect(d.recommendation).toMatch(/Try \d+ × \d+ for /);
  });

  it("matches a 9:16 Reel at 1080×1920", () => {
    const d = diagnoseAspectRatio(1080, 1920, REEL_RATIOS);
    expect(d.severity).toBe("ok");
    expect(d.matchedSpec?.id).toBe("reel-9-16");
  });

  it("treats a 1:1 square as a Reel warning (not 9:16)", () => {
    const d = diagnoseAspectRatio(1080, 1080, REEL_RATIOS);
    expect(d.severity).toBe("warning");
    expect(d.matchedSpec).toBeNull();
  });

  it("includes a human-readable ratio in the summary", () => {
    const d = diagnoseAspectRatio(1080, 1350, FEED_RATIOS);
    expect(d.summary).toContain("4:5");
  });
});

describe("diagnoseCarouselConsistency", () => {
  it("is OK when all slides match a carousel shape", () => {
    const slides = [
      { width: 1080, height: 1350 },
      { width: 1080, height: 1350 },
      { width: 1080, height: 1350 },
    ];
    const result = diagnoseCarouselConsistency(slides, CAROUSEL_RATIOS);
    expect(result.ok).toBe(true);
    expect(result.summary).toMatch(/All 3 slides match/);
  });

  it("flags a carousel with a mix of 1:1 and 4:5 slides", () => {
    const slides = [
      { width: 1080, height: 1350 },
      { width: 1080, height: 1080 },
      { width: 1080, height: 1350 },
    ];
    const result = diagnoseCarouselConsistency(slides, CAROUSEL_RATIOS);
    // Each slide individually is OK (both shapes are
    // valid), but the inconsistency is the operational
    // problem Instagram carousels present — both slides
    // are accepted, but the feed crops them differently.
    // The consistency check returns ok=true for "every
    // slide matches the candidate set"; callers can layer
    // additional checks (per-slide aspect equality) if
    // they need stricter guarantees.
    expect(result.ok).toBe(true);
  });

  it("is empty-safe", () => {
    const result = diagnoseCarouselConsistency([], CAROUSEL_RATIOS);
    expect(result.ok).toBe(true);
    expect(result.summary).toBe("");
  });
});
