import { describe, expect, it } from "vitest";
import { sanitizeMediaTags } from "@/lib/media/service";
import { MAX_TAGS_PER_ASSET, MAX_TAG_LENGTH } from "@/lib/media/bulk-cap";

describe("sanitizeMediaTags", () => {
  it("trims, dedupes, and clamps to MAX_TAG_LENGTH", () => {
    expect(sanitizeMediaTags(["  promo ", "promo", "x".repeat(MAX_TAG_LENGTH + 5)])).toEqual([
      "promo",
      "x".repeat(MAX_TAG_LENGTH),
    ]);
  });

  it("caps the tag list at MAX_TAGS_PER_ASSET", () => {
    const tags = Array.from({ length: MAX_TAGS_PER_ASSET + 5 }, (_, i) => `t-${i}`);
    expect(sanitizeMediaTags(tags)).toHaveLength(MAX_TAGS_PER_ASSET);
  });

  it("drops empty tags", () => {
    expect(sanitizeMediaTags(["", "   ", "x"])).toEqual(["x"]);
  });
});
