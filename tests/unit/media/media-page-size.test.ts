import { describe, expect, it } from "vitest";
import { MEDIA_PAGE_SIZE, MEDIA_PAGE_SIZE_OPTIONS, parseMediaPageSize } from "@/lib/media/service";

/**
 * Guards symptom 1 of the media-library rework: the first page carried more
 * records than an operator wants to scroll. The default is now one screen of
 * tiles, and the override is an allow-list rather than a free-form integer so
 * a hand-edited URL cannot ask the server for an unbounded page.
 */
describe("media library page size", () => {
  it("defaults to a single screen of tiles, not the old 24", () => {
    expect(MEDIA_PAGE_SIZE).toBe(12);
  });

  it("falls back to the default when no size is given", () => {
    expect(parseMediaPageSize(undefined)).toBe(MEDIA_PAGE_SIZE);
    expect(parseMediaPageSize("")).toBe(MEDIA_PAGE_SIZE);
  });

  it("accepts every advertised option", () => {
    for (const option of MEDIA_PAGE_SIZE_OPTIONS) {
      expect(parseMediaPageSize(String(option))).toBe(option);
    }
  });

  it("rejects a size that is not on the allow-list", () => {
    // An unbounded page would defeat the bandwidth reason the cap exists.
    expect(parseMediaPageSize("1000")).toBe(MEDIA_PAGE_SIZE);
    expect(parseMediaPageSize("7")).toBe(MEDIA_PAGE_SIZE);
    expect(parseMediaPageSize("-24")).toBe(MEDIA_PAGE_SIZE);
    expect(parseMediaPageSize("24.5")).toBe(MEDIA_PAGE_SIZE);
  });

  it("rejects non-numeric input instead of coercing it", () => {
    expect(parseMediaPageSize("all")).toBe(MEDIA_PAGE_SIZE);
    expect(parseMediaPageSize("12abc")).toBe(12);
    expect(parseMediaPageSize("0")).toBe(MEDIA_PAGE_SIZE);
    expect(parseMediaPageSize("NaN")).toBe(MEDIA_PAGE_SIZE);
  });

  it("offers the default as the first option so it is the cheap path", () => {
    expect(MEDIA_PAGE_SIZE_OPTIONS[0]).toBe(MEDIA_PAGE_SIZE);
  });
});
