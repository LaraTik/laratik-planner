import { describe, expect, it } from "vitest";

/**
 * Locale-aware formatter contract:
 *
 *   - Arabic uses Western `0–9` digits (`numberingSystem: "latn"`)
 *   - English and Arabic both produce the same digit set,
 *     differing only in surrounding text and list separator
 *   - Timezone is respected; explicit `timeZone` is honoured
 *   - `Intl`-built-in Arabic translation is accepted (we
 *     do not have to ship our own translations for months /
 *     weekday names; `Intl` already does it)
 */

const fmt = await import("@/lib/i18n/format-locale");

describe("i18n/format-locale — numbers", () => {
  it("Arabic numbers use Western digits", () => {
    expect(fmt.formatNumber(1234.5, "ar")).toMatch(/^[0-9,.]+$/);
  });

  it("English and Arabic both produce the same digit set for a number", () => {
    const en = fmt.formatNumber(1234.5, "en");
    const ar = fmt.formatNumber(1234.5, "ar");
    expect(en).toBe(ar); // because numberingSystem: "latn"
  });

  it("formatPercent renders 0.42 as 42% in either locale", () => {
    // `Intl.NumberFormat` in some Node versions embeds U+200E
    // (LEFT-TO-RIGHT MARK) around the percent sign for
    // correct rendering in mixed-direction contexts. Strip
    // those marks before asserting so the test pins the
    // user-visible shape, not the embedded bidi controls.
    const stripBidi = (s: string) => s.replace(/[‎‏‪-‮﻿]/g, "");
    expect(stripBidi(fmt.formatPercent(0.42, "en"))).toBe("42%");
    expect(stripBidi(fmt.formatPercent(0.42, "ar"))).toBe("42%");
    // Western digits only — no Arabic-Indic digits.
    expect(stripBidi(fmt.formatPercent(0.42, "ar"))).not.toMatch(/[٠-٩]/);
  });
});

describe("i18n/format-locale — dates", () => {
  const fixed = new Date("2026-09-01T12:00:00Z");

  it("renders the long form with English month name", () => {
    const out = fmt.formatDate(fixed, "en", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    expect(out).toContain("September");
    expect(out).toContain("2026");
  });

  it("renders the long form in Arabic with Western digits", () => {
    const out = fmt.formatDate(fixed, "ar", {
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
    // Arabic long month name from Intl.
    expect(out).toMatch(/سبتمبر/);
    // Western digits only.
    expect(out).toMatch(/[0-9]/);
    expect(out).not.toMatch(/[٠-٩]/);
  });

  it("respects an explicit IANA timezone", () => {
    const out = fmt.formatDate(fixed, "en", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Cairo",
      timeZoneName: "short",
    });
    // 12:00 UTC = 15:00 in Cairo (EEST, UTC+3 in September —
    // Egypt observes DST through the last Thursday of
    // October). The en-US default renders this as "03:00
    // PM" with a "GMT+3" zone tag. We assert the zone tag
    // so the test is independent of the host's `hour12`
    // / `hourCycle` defaults.
    expect(out).toMatch(/GMT\+3/);
  });

  it("uses stable date-time punctuation across Intl runtimes", () => {
    // Day-first ordering is the project-wide default.
    // The English connector is a middle dot (·) which is
    // unambiguous across Node, ICU and WebKit, and reads
    // naturally in both English and Arabic.
    expect(fmt.formatDate(fixed, "en", { ...fmt.DateFormat.dateTime, timeZone: "UTC" })).toBe(
      "1 Sep 2026 · 12:00 PM",
    );
  });

  it("renders day-first numeric dates (DD/MM/YYYY) for both locales", () => {
    // The `iso` preset produces DD/MM/YYYY for English and
    // Arabic alike. Before this change, English produced
    // MM/DD/YYYY which created ambiguity for non-US users.
    const en = fmt.formatDate(fixed, "en", { ...fmt.DateFormat.iso, timeZone: "UTC" });
    const ar = fmt.formatDate(fixed, "ar", { ...fmt.DateFormat.iso, timeZone: "UTC" });
    expect(en).toBe("01/09/2026");
    expect(ar).toBe("01/09/2026");
  });

  it("renders day-first short dates (DD MMM YYYY) for both locales", () => {
    // `short` preset uses abbreviated month names in the
    // day-first order. The English text comes from Intl
    // ("Sep" in en, "Sep" or Arabic month in ar) but the
    // day always precedes the month.
    const en = fmt.formatDate(fixed, "en", { ...fmt.DateFormat.short, timeZone: "UTC" });
    expect(en).toBe("1 Sep 2026");
    // Day is the first numeric component.
    const dayMonthMatch = en.match(/^(\d+)\s/);
    expect(dayMonthMatch?.[1]).toBe("1");
  });

  it("honours `dayFirst: false` for callers that want month-first ordering", () => {
    // The escape hatch: callers that need the legacy
    // month-first ordering (e.g. integration with a US-only
    // third-party service) can pass `dayFirst: false`. The
    // project doesn't use this anywhere; the test pins the
    // contract.
    const out = fmt.formatDate(fixed, "en", {
      ...fmt.DateFormat.dateTime,
      timeZone: "UTC",
      dayFirst: false,
    });
    expect(out).toBe("Sep 1, 2026 · 12:00 PM");
  });
});

describe("i18n/format-locale — relative + list", () => {
  it("formatRelativeTime renders an English phrase", () => {
    const out = fmt.formatRelativeTime(-1, "hour", "en");
    expect(out).toMatch(/hour/);
  });

  it("formatRelativeTime Arabic uses no Eastern digits (latn numbering)", () => {
    // Intl.RelativeTimeFormat with `numeric: "auto"` returns
    // a qualitative form ("hour ago" / "منذ ساعة") which
    // contains no digits in either locale. We assert the
    // shape and the absence of Eastern digits so the
    // Western-digit contract is locked.
    const out = fmt.formatRelativeTime(-2, "hour", "ar");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toMatch(/[٠-٩]/);
  });

  it("formatList joins with a locale-appropriate conjunction", () => {
    const en = fmt.formatList(["a", "b", "c"], "en");
    const ar = fmt.formatList(["a", "b", "c"], "ar");
    expect(en).toContain("a");
    expect(ar).toContain("a");
    // English uses ", " as the conjunction.
    expect(en).toMatch(/,/);
    // Arabic uses the "و" (wa) conjunction for the long
    // conjunction style; the U+060C comma is reserved for
    // disjunction. The test pins the *real* Intl output
    // rather than the more "obvious" Arabic comma.
    expect(ar).toMatch(/و/);
  });
});
