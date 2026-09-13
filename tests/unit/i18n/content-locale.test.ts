import { describe, expect, it } from "vitest";
import { resolveContentLocale } from "@/lib/i18n/content-locale";

describe("resolveContentLocale", () => {
  it("prefers the explicit content language", () => {
    expect(
      resolveContentLocale({
        formatPayload: { contentLanguage: "en", caption: "مرحبا" },
        fallback: "ar",
      }),
    ).toBe("en");
  });

  it("detects Arabic source copy for legacy items without a language", () => {
    expect(
      resolveContentLocale({
        formatPayload: { caption: "خود نفس، وضع حدودك الشخصية." },
        fallback: "en",
      }),
    ).toBe("ar");
  });

  it("falls back to the agency content default when no signal exists", () => {
    expect(resolveContentLocale({ formatPayload: { schemaVersion: 1 }, fallback: "en" })).toBe(
      "en",
    );
  });
});
