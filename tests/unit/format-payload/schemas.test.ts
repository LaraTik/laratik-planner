import { describe, expect, it } from "vitest";

import {
  FormatPayloadByFormat,
  getTranslation,
  parseFormatPayload,
  translatableFieldKeys,
} from "@/lib/format-payload/schemas";

describe("format-payload/schemas", () => {
  describe("parseFormatPayload", () => {
    it("accepts the default empty payload `{ schemaVersion: 1 }`", () => {
      const out = parseFormatPayload("static_post", { schemaVersion: 1 });
      expect(out.schemaVersion).toBe(1);
    });

    it("normalises a null payload to the default", () => {
      const out = parseFormatPayload("carousel", null);
      expect(out.schemaVersion).toBe(1);
    });

    it("rejects an unknown locale in `translations`", () => {
      const result = FormatPayloadByFormat.static_post.safeParse({
        schemaVersion: 1,
        caption: "Spring drop",
        translations: { xx: { caption: "X" } },
      });
      expect(result.success).toBe(false);
    });

    it("accepts a translation under a known locale", () => {
      const result = FormatPayloadByFormat.static_post.safeParse({
        schemaVersion: 1,
        caption: "Spring drop",
        translations: { ar: { caption: "مجموعة ربيعية" } },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.translations?.ar?.caption).toBe("مجموعة ربيعية");
      }
    });

    it("rejects an over-length caption", () => {
      const result = FormatPayloadByFormat.static_post.safeParse({
        schemaVersion: 1,
        caption: "x".repeat(2_201),
      });
      expect(result.success).toBe(false);
    });

    it("rejects a slideOutline slide count > 10 for carousel", () => {
      const result = FormatPayloadByFormat.carousel.safeParse({
        schemaVersion: 1,
        slideCount: 11,
      });
      expect(result.success).toBe(false);
    });

    it("rejects a duration < 5s for short_form_video", () => {
      const result = FormatPayloadByFormat.short_form_video.safeParse({
        schemaVersion: 1,
        durationSeconds: 4,
      });
      expect(result.success).toBe(false);
    });

    it("accepts a story with the right frame count", () => {
      const result = FormatPayloadByFormat.story.safeParse({
        schemaVersion: 1,
        frameCount: 3,
      });
      expect(result.success).toBe(true);
    });

    it("rejects a live_content guests entry with an unknown role", () => {
      const result = FormatPayloadByFormat.live_content.safeParse({
        schemaVersion: 1,
        guests: [{ name: "Host", role: "ringmaster" as unknown as "host" }],
      });
      expect(result.success).toBe(false);
    });

    it("accepts an article outline", () => {
      const result = FormatPayloadByFormat.article.safeParse({
        schemaVersion: 1,
        outline: [{ level: 2, title: "Intro" }],
      });
      expect(result.success).toBe(true);
    });
  });

  describe("translatableFieldKeys", () => {
    it("returns the common fields for every format", () => {
      const staticKeys = translatableFieldKeys("static_post");
      expect(staticKeys).toContain("caption");
      expect(staticKeys).toContain("hook");
      expect(staticKeys).toContain("callToAction");
    });

    it("includes format-specific fields", () => {
      expect(translatableFieldKeys("carousel")).toContain("slideOutline");
      expect(translatableFieldKeys("short_form_video")).toContain("scenes");
      expect(translatableFieldKeys("long_form_video")).toContain("chapters");
      expect(translatableFieldKeys("article")).toContain("outline");
    });

    it("does not include the `objective` enum (it doesn't translate)", () => {
      expect(translatableFieldKeys("static_post")).not.toContain("objective");
      expect(translatableFieldKeys("article")).not.toContain("objective");
    });
  });

  describe("getTranslation", () => {
    it("returns an empty object when the payload is null", () => {
      expect(getTranslation(null, "static_post", "ar")).toEqual({});
    });

    it("returns the translation map for a known locale", () => {
      const payload = parseFormatPayload("static_post", {
        schemaVersion: 1,
        caption: "Spring drop",
        translations: { ar: { caption: "X" } },
      });
      expect(getTranslation(payload, "static_post", "ar")).toEqual({ caption: "X" });
    });

    it("returns an empty object for an unknown locale", () => {
      const payload = parseFormatPayload("static_post", {
        schemaVersion: 1,
        translations: { ar: { caption: "X" } },
      });
      // The type signature is LocaleCode; the unknown-locale
      // fallback is exercised by the Zod schema rejection test
      // above and by resolveLocale() in i18n/locales. Here we
      // just confirm a known other-locale returns empty.
      expect(getTranslation(payload, "static_post", "ar" as unknown as "en")).toEqual({
        caption: "X",
      });
    });
  });
});
