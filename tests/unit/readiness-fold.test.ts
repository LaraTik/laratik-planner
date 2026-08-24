import { describe, expect, it } from "vitest";
import {
  foldAiSuggestions,
  ReadinessReportSchema,
  type ReadinessReport,
} from "@/lib/publishing/readiness";

/**
 * M4.4 — Readiness pure-helper unit tests.
 *
 * The DB-bound `evaluateReadiness` path is exercised in the
 * integration suite. This file tests the pure helpers and the
 * `foldAiSuggestions` adapter that the publish UI uses to
 * merge AI completeness_check output into a readiness
 * report.
 */
describe("M4.4 — readiness pure helpers (unit)", () => {
  describe("ReadinessReportSchema", () => {
    it("accepts a valid empty-channel report (0 channels = not ready)", () => {
      const report: ReadinessReport = {
        contentItemId: "11111111-1111-4111-8111-111111111111",
        revision: 0,
        blockers: 0,
        recommendations: 0,
        requiredTotal: 0,
        requiredCompleted: 0,
        canPublish: false,
        issues: [],
        channels: [],
      };
      const parsed = ReadinessReportSchema.parse(report);
      expect(parsed.canPublish).toBe(false); // no channels
    });
  });

  describe("foldAiSuggestions", () => {
    const base: ReadinessReport = {
      contentItemId: "11111111-1111-4111-8111-111111111111",
      revision: 3,
      blockers: 0,
      recommendations: 1,
      requiredTotal: 4,
      requiredCompleted: 4,
      canPublish: true,
      issues: [
        {
          path: "channels.a.disclosures.rightsConfirmed",
          code: "rights_not_confirmed",
          severity: "recommendation",
          message: "Confirm media rights before publishing.",
        },
      ],
      channels: [
        {
          socialChannelId: "a",
          platform: "instagram",
          hasPayload: true,
          blockerCount: 0,
          recommendationCount: 1,
          issues: [],
        },
      ],
    };

    it("appends AI suggestions as recommendations (never blockers)", () => {
      const folded = foldAiSuggestions(base, [
        { path: "channels.a.payload.caption", message: "Consider tightening the first sentence." },
      ]);
      expect(folded.issues.length).toBe(2);
      expect(folded.recommendations).toBe(2);
      expect(folded.canPublish).toBe(true);
    });

    it("an AI suggestion never adds a blocker (advisory only)", () => {
      const folded = foldAiSuggestions(base, [
        { path: "channels.a.payload.caption", message: "This caption is a blocker." },
      ]);
      const blocker = folded.issues.find((i) => i.path === "channels.a.payload.caption");
      expect(blocker?.severity).toBe("recommendation");
    });

    it("uses the supplied code when given, otherwise falls back to ai_suggestion", () => {
      const folded = foldAiSuggestions(base, [
        { path: "x", message: "y", code: "tone_check" },
        { path: "z", message: "w" },
      ]);
      const a = folded.issues.find((i) => i.path === "x");
      const b = folded.issues.find((i) => i.path === "z");
      expect(a?.code).toBe("tone_check");
      expect(b?.code).toBe("ai_suggestion");
    });
  });
});
