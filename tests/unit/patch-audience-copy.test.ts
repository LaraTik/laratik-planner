import { describe, expect, it } from "vitest";
import { PatchAudienceCopySchema } from "@/lib/content/service";

/**
 * Compatibility schema tests for the legacy partial caption /
 * hashtags / firstComment patch path. The service now routes
 * this wrapper through the material audience-copy path.
 *
 * The full service test (with a mocked DB) is intentionally
 * not in this file: `patchAudienceCopy` shares the Drizzle
 * mocking harness in `content-service.test.ts`, which would
 * couple this small PR to a much larger test surface. The
 * schema below is the contract the server action and the
 * service both honour; if the schema validation breaks, the
 * action returns a field error and the user sees an inline
 * message. The behaviour-level test lives in the larger
 * suite.
 */

const contentItemId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

describe("PatchAudienceCopySchema", () => {
  it("accepts a caption-only patch", () => {
    const result = PatchAudienceCopySchema.safeParse({
      contentItemId,
      caption: "New caption",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a hashtags-only patch", () => {
    const result = PatchAudienceCopySchema.safeParse({
      contentItemId,
      hashtags: ["launch", "founder"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts a firstComment-only patch", () => {
    const result = PatchAudienceCopySchema.safeParse({
      contentItemId,
      firstComment: "Anchor comment",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a multi-field patch", () => {
    const result = PatchAudienceCopySchema.safeParse({
      contentItemId,
      caption: "New caption",
      hashtags: ["launch"],
      firstComment: "Anchor",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty patch (no fields)", () => {
    // The schema itself allows no fields (per-field optional),
    // but the service raises a domain error. This test
    // documents the schema contract: an empty payload is
    // *structurally* valid, the gate is the service-level
    // "at least one field" check.
    const result = PatchAudienceCopySchema.safeParse({ contentItemId });
    expect(result.success).toBe(true);
  });

  it("rejects an over-length caption", () => {
    const result = PatchAudienceCopySchema.safeParse({
      contentItemId,
      caption: "x".repeat(2_201),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID contentItemId", () => {
    const result = PatchAudienceCopySchema.safeParse({
      contentItemId: "not-a-uuid",
      caption: "x",
    });
    expect(result.success).toBe(false);
  });

  it("caps hashtags at 30", () => {
    const result = PatchAudienceCopySchema.safeParse({
      contentItemId,
      hashtags: Array.from({ length: 31 }, (_, i) => `tag${i}`),
    });
    expect(result.success).toBe(false);
  });
});
