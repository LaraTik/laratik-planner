import { describe, expect, it } from "vitest";

import { resolveLocale, SUPPORTED_LOCALES, translationLocalesFor } from "@/lib/i18n/locales";

describe("i18n/locales", () => {
  it("exposes a closed set in v1", () => {
    const codes = SUPPORTED_LOCALES.map((l) => l.code).sort();
    expect(codes).toEqual(["ar", "en"]);
  });

  describe("resolveLocale", () => {
    it("returns the descriptor for a known code", () => {
      expect(resolveLocale("en").dir).toBe("ltr");
      expect(resolveLocale("ar").dir).toBe("rtl");
    });

    it("falls back to English for null / undefined / unknown", () => {
      expect(resolveLocale(null).code).toBe("en");
      expect(resolveLocale(undefined).code).toBe("en");
      // Legacy `en-US` from before the v1 narrow-set: don't crash.
      expect(resolveLocale("en-US").code).toBe("en");
      expect(resolveLocale("pt-BR").code).toBe("en");
    });
  });

  describe("translationLocalesFor", () => {
    it("excludes the source locale from the translation picker", () => {
      expect(translationLocalesFor("en").map((l) => l.code)).toEqual(["ar"]);
      expect(translationLocalesFor("ar").map((l) => l.code)).toEqual(["en"]);
    });
  });
});
