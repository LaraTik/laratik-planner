import { describe, expect, it } from "vitest";

import {
  buildAudienceCopyViewModel,
  mapFormatPayloadToPlatform,
} from "@/lib/format-payload/mapper";

describe("format-payload/mapper", () => {
  it("returns an empty object for a null payload", () => {
    expect(mapFormatPayloadToPlatform({ format: "static_post", formatPayload: null })).toEqual({});
  });

  it("returns an empty object for a malformed payload (does not throw)", () => {
    expect(
      mapFormatPayloadToPlatform({
        format: "static_post",
        formatPayload: { schemaVersion: 1, hashtags: "not an array" as unknown as string[] },
      }),
    ).toEqual({});
  });

  it("maps caption, hashtags, firstComment, and callToAction from the source locale", () => {
    const out = mapFormatPayloadToPlatform({
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        caption: "Spring drop",
        hashtags: ["#spring", "#drop"],
        firstComment: "Link in bio",
        callToAction: "Shop now",
      },
    });
    expect(out.caption).toBe("Spring drop");
    expect(out.hashtags).toEqual(["#spring", "#drop"]);
    expect(out.firstComment).toBe("Link in bio");
    expect(out.callToAction).toEqual({ label: "Shop now", url: "" });
  });

  it("prefers the per-locale translation when publishLanguage matches", () => {
    const out = mapFormatPayloadToPlatform({
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        caption: "Spring drop",
        hashtags: ["#spring"],
        translations: {
          ar: { caption: "مجموعة ربيعية", hashtags: ["#ربيع"] },
        },
      },
      publishLanguage: "ar",
    });
    expect(out.caption).toBe("مجموعة ربيعية");
    expect(out.hashtags).toEqual(["#ربيع"]);
    expect(out.contentLanguage).toBe("ar");
  });

  it("builds locale-specific resolved copy for Publishing", () => {
    const view = buildAudienceCopyViewModel({
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        caption: "Spring drop",
        translations: { ar: { caption: "مجموعة ربيعية" } },
      },
    });
    expect(view.resolvedByLocale.en?.caption).toBe("Spring drop");
    expect(view.resolvedByLocale.ar?.caption).toBe("مجموعة ربيعية");
  });

  it("falls back to the source values when publishLanguage has no translation", () => {
    const out = mapFormatPayloadToPlatform({
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        caption: "Spring drop",
        translations: { ar: { caption: "X" } },
      },
      publishLanguage: "fr",
    });
    expect(out.caption).toBe("Spring drop");
    expect(out.contentLanguage).toBe("fr");
  });

  it("maps location for static_post", () => {
    const out = mapFormatPayloadToPlatform({
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        location: { name: "Dubai Mall", externalId: "fb-123" },
      },
    });
    expect(out.location).toEqual({ name: "Dubai Mall", externalId: "fb-123" });
  });

  it("does not map location for non-static_post formats", () => {
    const out = mapFormatPayloadToPlatform({
      format: "carousel",
      formatPayload: {
        schemaVersion: 1,
        caption: "X",
        // Force-typed; location is only on static_post.
        location: { name: "X" } as unknown as never,
      },
    });
    expect(out.location).toBeUndefined();
  });

  it("maps description for long_form_video", () => {
    const out = mapFormatPayloadToPlatform({
      format: "long_form_video",
      formatPayload: {
        schemaVersion: 1,
        description: "Long-form written description",
        caption: "Caption (short)",
      },
    });
    expect(out.description).toBe("Long-form written description");
  });

  it("truncates a too-long callToAction to the schema limit (40 chars)", () => {
    const out = mapFormatPayloadToPlatform({
      format: "static_post",
      formatPayload: {
        schemaVersion: 1,
        callToAction: "x".repeat(80),
      },
    });
    expect(out.callToAction?.label).toHaveLength(40);
  });
});
