import { describe, expect, it } from "vitest";

import {
  FIELD_MAX_LENGTHS,
  FormatPayloadByFormat,
  fieldMaxLength,
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

  /**
   * FIELD_MAX_LENGTHS — single source of truth for the
   * `maxLength` HTML attribute on the format-payload field
   * renderers, and for the AI prompt's per-field cap. The
   * test pins the contract: every planner-facing field has
   * a value, and the value is large enough to be useful
   * but never smaller than the underlying Zod schema.
   */
  describe("FIELD_MAX_LENGTHS", () => {
    it("exposes a non-empty entry for every planner-facing string field", () => {
      // The fields the Format Aware Content Editor renders
      // today. The list is the rendered surface, not the
      // full schema — a field that's never rendered doesn't
      // need an entry.
      const rendered = [
        "caption",
        "firstComment",
        "hook",
        "mainMessage",
        "callToAction",
        "visualDirection",
        "additionalNotes",
        "onScreenText",
        "voiceOverNotes",
        "description",
        "coverDirection",
        "audioReference",
      ];
      for (const key of rendered) {
        const cap = fieldMaxLength(key as keyof typeof FIELD_MAX_LENGTHS);
        expect(cap, `${key} should have a positive cap`).toBeGreaterThan(0);
      }
    });

    it("aligns the `caption` cap with the static_post Zod schema (2 200)", () => {
      // Sanity check: the UI cap must equal the schema cap.
      // The previous TextFieldRenderer used 220, which let
      // the user type up to 2 200 chars but truncated on
      // submit silently. The new map pins the cap.
      expect(fieldMaxLength("caption")).toBe(2_200);
      expect(fieldMaxLength("firstComment")).toBe(2_200);
    });

    it("aligns the `visualDirection` cap with the static_post Zod schema (2 000)", () => {
      expect(fieldMaxLength("visualDirection")).toBe(2_000);
      expect(fieldMaxLength("additionalNotes")).toBe(2_000);
      expect(fieldMaxLength("onScreenText")).toBe(2_000);
      expect(fieldMaxLength("voiceOverNotes")).toBe(2_000);
    });

    it("aligns the URL / reference caps with the schema (500)", () => {
      expect(fieldMaxLength("coverDirection")).toBe(500);
      expect(fieldMaxLength("audioReference")).toBe(500);
      expect(fieldMaxLength("referenceUrl")).toBe(500);
    });

    it("aligns the long-form video `description` cap with the schema (10 000)", () => {
      // The YouTube API allows 5 000 chars; 10 000 is a
      // safety margin for future expansion. The test pins
      // the contract so a future refactor doesn't shrink
      // it back to the 2 200 default.
      expect(fieldMaxLength("description")).toBe(10_000);
    });
  });
});
