import { describe, expect, it } from "vitest";
import {
  assertWithinBulkCap,
  BULK_SELECTION_TOO_LARGE,
  bulkSelectionHeadroom,
  isWithinBulkCap,
  MAX_BULK_SELECTION,
  MAX_TAGS_PER_ASSET,
  MAX_TAG_LENGTH,
} from "@/lib/media/bulk-cap";

describe("media bulk cap", () => {
  it("defines the cap once", () => {
    expect(MAX_BULK_SELECTION).toBe(500);
    expect(MAX_TAGS_PER_ASSET).toBe(32);
    expect(MAX_TAG_LENGTH).toBe(64);
    expect(BULK_SELECTION_TOO_LARGE).toBe("bulk_selection_too_large");
  });

  it("accepts selections at or below the cap", () => {
    expect(() => assertWithinBulkCap([])).not.toThrow();
    expect(() => assertWithinBulkCap(new Array(MAX_BULK_SELECTION).fill("x"))).not.toThrow();
    expect(isWithinBulkCap(new Array(MAX_BULK_SELECTION).fill("x"))).toBe(true);
  });

  it("rejects selections above the cap with a structured message", () => {
    const ids = new Array(MAX_BULK_SELECTION + 1).fill("x");
    expect(isWithinBulkCap(ids)).toBe(false);
    expect(() => assertWithinBulkCap(ids)).toThrowError(BULK_SELECTION_TOO_LARGE);
  });

  it("reports the headroom remaining", () => {
    expect(bulkSelectionHeadroom(0)).toBe(MAX_BULK_SELECTION);
    expect(bulkSelectionHeadroom(MAX_BULK_SELECTION)).toBe(0);
    expect(bulkSelectionHeadroom(MAX_BULK_SELECTION + 10)).toBe(0);
  });
});
