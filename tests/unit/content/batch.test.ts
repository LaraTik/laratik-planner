import { describe, expect, it } from "vitest";

import { parseBatchRow, parseBatchRows } from "@/lib/content/batch";

describe("content/batch", () => {
  describe("parseBatchRow", () => {
    it("parses the v1 4-field shape", () => {
      const out = parseBatchRow(
        "Launch teaser | short_form_video | 2026-09-01T09:00:00Z | Reveal the new collection",
      );
      expect(out.title).toBe("Launch teaser");
      expect(out.format).toBe("short_form_video");
      expect(out.plannedPublishAt).toBe("2026-09-01T09:00:00Z");
      expect(out.brief).toBe("Reveal the new collection");
      expect(out.extensions).toEqual({});
    });

    it("parses the v2 5-field shape with caption", () => {
      const out = parseBatchRow(
        "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order now",
      );
      expect(out.extensions.caption).toBe("Pre-order now");
      expect(out.extensions.hashtags).toBeUndefined();
    });

    it("parses the v2 6-field shape with hashtags", () => {
      const out = parseBatchRow(
        "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order | #spring #drop",
      );
      expect(out.extensions.caption).toBe("Pre-order");
      expect(out.extensions.hashtags).toEqual(["#spring", "#drop"]);
    });

    it("parses the v2 7-field shape with location (name|externalId in one cell)", () => {
      const out = parseBatchRow(
        "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order | #spring | Dubai Mall|fb-123",
      );
      expect(out.extensions.location).toEqual({ name: "Dubai Mall", externalId: "fb-123" });
    });

    it("parses the v2 7-field shape with location (name only)", () => {
      const out = parseBatchRow(
        "Spring drop | static_post | 2026-09-05T09:00:00Z | The reveal | Pre-order | #spring | Dubai Mall",
      );
      expect(out.extensions.location).toEqual({ name: "Dubai Mall" });
    });

    it("rejects an over-length caption", () => {
      expect(() =>
        parseBatchRow(`Title | static_post | 2026-09-05T09:00:00Z | Brief | ${"x".repeat(2_201)}`),
      ).toThrow();
    });

    it("rejects a too-long hashtag", () => {
      expect(() =>
        parseBatchRow(
          `Title | static_post | 2026-09-05T09:00:00Z | Brief | Caption | ${"#".repeat(70)}`,
        ),
      ).toThrow();
    });
  });

  describe("parseBatchRows", () => {
    it("parses a multi-line input and preserves the line numbers", () => {
      const out = parseBatchRows(
        "Title 1 | static_post | 2026-09-01T09:00:00Z\n" +
          "Title 2 | story | 2026-09-02T09:00:00Z | Brief",
      );
      expect(out).toHaveLength(2);
      expect(out[0]?.lineNumber).toBe(1);
      expect(out[0]?.title).toBe("Title 1");
      expect(out[1]?.lineNumber).toBe(2);
      expect(out[1]?.title).toBe("Title 2");
    });

    it("captures a parse error per line without throwing", () => {
      const out = parseBatchRows(
        "Title 1 | static_post | 2026-09-01T09:00:00Z\n" +
          `Title 2 | static_post | 2026-09-02T09:00:00Z | Brief | ${"x".repeat(2_201)}`,
      );
      expect(out).toHaveLength(2);
      const bad = out.find((r) => r.lineNumber === 2);
      expect(bad).toBeDefined();
      expect("parseError" in (bad ?? {})).toBe(true);
    });

    it("ignores empty lines", () => {
      const out = parseBatchRows("\n  \nTitle 1 | static_post | 2026-09-01T09:00:00Z\n");
      expect(out).toHaveLength(1);
    });
  });
});
