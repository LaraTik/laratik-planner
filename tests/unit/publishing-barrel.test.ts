import { describe, expect, it } from "vitest";

/**
 * M4 — Publishing barrel re-export coverage.
 *
 * The `src/lib/publishing/index.ts` and `materiality-helpers.ts`
 * barrels re-export every public surface of the publishing
 * service cluster. Without an explicit import test, vitest
 * coverage reports the barrels as 0% even though every
 * re-exported symbol is exercised through the per-service test
 * files.
 *
 * This file touches every runtime re-export in both barrels so
 * the v8 coverage tool counts each re-export binding as
 * invoked. The actual behaviour is asserted in
 * `publishing-platform-payload.test.ts`,
 * `publishing-materiality.test.ts`, and
 * `publishing-readiness-evaluate.test.ts`.
 */
describe("src/lib/publishing barrel", () => {
  it("re-exports every public symbol from the underlying modules", async () => {
    const barrel = await import("@/lib/publishing");
    const materialityHelpers = await import("@/lib/publishing/materiality-helpers");

    // Every value re-export must be referenced at least once
    // (or its function is "0 of 1" covered). We assert
    // `typeof !== "undefined"` for each so a future rename of
    // a re-export is caught at the test layer.
    const barrelValueExports = [
      "PlatformPayloadSchema",
      "CommonPublishingFieldsSchema",
      "InstagramPostPayloadSchema",
      "InstagramReelPayloadSchema",
      "FacebookPayloadSchema",
      "TikTokPayloadSchema",
      "LinkedInPayloadSchema",
      "YouTubePayloadSchema",
      "PinterestPayloadSchema",
      "XPayloadSchema",
      "OtherPayloadSchema",
      "PLATFORM_KEYS",
      "SavePlatformPayloadInputSchema",
      "savePlatformPayload",
      "readPlatformPayload",
      "readAllChannelPayloads",
      "clearChannelPayload",
      "PlatformPayloadError",
      "MATERIAL_RESOURCES",
      "MATERIAL_RESOURCE_PLATFORM_PAYLOAD",
      "MaterialityReasonCodeSchema",
      "recordMaterialityEvent",
      "recordNonMaterialityEvent",
      "listMaterialEdits",
      "newMaterialityCorrelationId",
      "MaterialityError",
      "ReadinessReportSchema",
      "ReadinessIssueSchema",
      "ChannelReadinessSchema",
      "ReadinessIssueSeveritySchema",
      "evaluateReadiness",
      "foldAiSuggestions",
      "ReadinessError",
      // FEAT-17 (GAP-FULL-REVIEW-2026-08-25) — publishing adapter
      // slot. LinkedIn + X stubs are the first concrete adapters;
      // the registry entry point is what the M4.5 dispatcher will
      // call into.
      "LinkedInPublishingAdapter",
      "XPublishingAdapter",
      "publishingAdapterRegistry",
      "isSupportedPlatform",
    ] as const;

    for (const name of barrelValueExports) {
      expect(typeof (barrel as Record<string, unknown>)[name]).not.toBe("undefined");
    }
    // The materiality-helpers barrel is the inner re-export the
    // outer `index.ts` composes. Touch its names too so the inner
    // barrel's function coverage counts as "invoked".
    const helpersValueExports = [
      "PlatformPayloadSchema",
      "CommonPublishingFieldsSchema",
      "InstagramPostPayloadSchema",
      "InstagramReelPayloadSchema",
      "FacebookPayloadSchema",
      "TikTokPayloadSchema",
      "LinkedInPayloadSchema",
      "YouTubePayloadSchema",
      "PinterestPayloadSchema",
      "XPayloadSchema",
      "OtherPayloadSchema",
      "PLATFORM_KEYS",
      "SavePlatformPayloadInputSchema",
      "savePlatformPayload",
      "readPlatformPayload",
      "readAllChannelPayloads",
      "clearChannelPayload",
      "PlatformPayloadError",
      "MATERIAL_RESOURCES",
      "MATERIAL_RESOURCE_PLATFORM_PAYLOAD",
      "MaterialityReasonCodeSchema",
      "RecordNonMaterialityEventInputSchema",
      "recordMaterialityEvent",
      "recordNonMaterialityEvent",
      "listMaterialEdits",
      "newMaterialityCorrelationId",
      "MaterialityError",
      "ReadinessReportSchema",
      "ReadinessIssueSchema",
      "ChannelReadinessSchema",
      "ReadinessIssueSeveritySchema",
      "evaluateReadiness",
      "foldAiSuggestions",
      "ReadinessError",
    ] as const;
    for (const name of helpersValueExports) {
      expect(typeof (materialityHelpers as Record<string, unknown>)[name]).not.toBe("undefined");
    }
  });
});
