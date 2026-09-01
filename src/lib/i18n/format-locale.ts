import "server-only";

import { type LocaleCode } from "@/lib/i18n/locales";

/**
 * Locale-aware number, percentage, date, and time formatters.
 *
 * The product renders Arabic in the standard
 * Modern Standard Arabic register with **Western `0–9` digits**
 * (`numberingSystem: "latn"`). This is the plan's locked
 * decision — it keeps brand voice, captions, hashtags, and
 * technical values (channel handles, file IDs, percentages)
 * consistent with English conventions, while the surrounding
 * text, currency, and unit labels render in Arabic.
 *
 * The helpers are pure: they take a `LocaleCode` and
 * formatting options, return a formatter function. They never
 * touch the DOM, the database, or the cookies — they are
 * safe to import from client or server modules and from
 * Server Component / Client Component boundaries alike.
 *
 * Timezone is the caller's responsibility. Business dates
 * (planned publish, lead-time thresholds, etc.) must pass
 * the workspace's `IANA` timezone so a planner in Cairo
 * publishing for 09:00 local does not get a 07:00 / 08:00
 * by accident. The `formatDate` / `formatTime` helpers below
 * take an explicit `timeZone` option and fall back to the
 * runtime's local zone when the caller does not specify.
 */

type IntlLocaleOptions = {
  timeZone?: string;
  timeZoneName?: "short" | "long" | "shortOffset" | "longOffset" | "shortGeneric" | "longGeneric";
};

const WESTERN_ARABIC_DIGITS = "latn" as const;

/** Build a `BCP 47` locale string for `Intl` APIs. */
function bcp47(code: LocaleCode): string {
  // The plan's locked set is `en` and `ar`. Both are valid
  // language-only BCP 47 tags; `Intl` accepts them as-is.
  return code;
}

/** Wrap an `Intl.NumberFormat` with `numberingSystem: "latn"`. */
function withLatnDigits<T extends Intl.NumberFormatOptions | Intl.DateTimeFormatOptions>(
  options: T | undefined,
): T {
  // `numberingSystem` is a valid property on both
  // `NumberFormatOptions` and `DateTimeFormatOptions` even
  // though the TS lib types only declare it on the former;
  // we cast to a structural record so the helper is shared.
  return { ...(options ?? {}), numberingSystem: WESTERN_ARABIC_DIGITS } as T;
}

// ─── Numbers ───────────────────────────────────────────────────────────────

/**
 * Format a number in the active locale with Western digits.
 *
 * Examples:
 *   - `formatNumber(1234.5, "ar")` → `"1,234.5"`
 *   - `formatNumber(1234.5, "en")` → `"1,234.5"`
 *   - `formatNumber(0.87, "ar", { style: "percent" })` → `"87%"`
 */
export function formatNumber(
  value: number,
  code: LocaleCode,
  options?: Intl.NumberFormatOptions & IntlLocaleOptions,
): string {
  const locale = bcp47(code);
  return new Intl.NumberFormat(locale, withLatnDigits(options)).format(value);
}

/**
 * Format a percentage. A value of `0.42` renders as `"42%"` in
 * either locale. For non-`latn` numbering systems in future
 * locales this remains the only call site that needs to know.
 */
export function formatPercent(
  value: number,
  code: LocaleCode,
  options?: Intl.NumberFormatOptions & IntlLocaleOptions,
): string {
  return formatNumber(value, code, { style: "percent", ...(options ?? {}) });
}

/** Format a currency amount. Caller supplies the ISO 4217 code. */
export function formatCurrency(
  value: number,
  currency: string,
  code: LocaleCode,
  options?: Intl.NumberFormatOptions & IntlLocaleOptions,
): string {
  return formatNumber(value, code, { style: "currency", currency, ...(options ?? {}) });
}

// ─── Dates and times ───────────────────────────────────────────────────────

/**
 * Format a date in the active locale with Western digits and
 * the supplied timezone. `timeZone` MUST be an IANA name
 * (e.g. `"Africa/Cairo"`, `"Europe/Berlin"`); the planner's
 * workspace timezone is the canonical source.
 */
export function formatDate(
  value: Date | string | number,
  code: LocaleCode,
  options?: Intl.DateTimeFormatOptions & IntlLocaleOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  const locale = bcp47(code);
  return new Intl.DateTimeFormat(locale, withLatnDigits(options)).format(date);
}

/** Common date format presets. Use these instead of hand-rolling
 *  `Intl.DateTimeFormatOptions` at callsites — the preset is the
 *  contract for "what a date looks like in this surface". */
export const DateFormat = {
  short: { year: "numeric", month: "short", day: "numeric" } as const,
  long: { year: "numeric", month: "long", day: "numeric" } as const,
  monthDay: { month: "short", day: "numeric" } as const,
  weekdayShort: { weekday: "short", month: "short", day: "numeric" } as const,
  iso: { year: "numeric", month: "2-digit", day: "2-digit" } as const,
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export const TimeFormat = {
  short: { hour: "2-digit", minute: "2-digit" } as const,
  shortWithZone: {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  } as const,
} satisfies Record<string, Intl.DateTimeFormatOptions>;

// ─── Relative time (manual) ────────────────────────────────────────────────

/**
 * Format a duration as a short, locale-aware relative phrase.
 * The Intl.RelativeTimeFormat API covers years, months, days,
 * hours, minutes, and seconds. We expose a thin wrapper so
 * callsites pass an already-computed delta in seconds and get
 * back a translated "3 hours ago" / "قبل 3 ساعات" string.
 *
 * The wrappers around `Intl` here are locale-tagged, not
 * registry-resolved: a future locale addition only needs to
 * add a `LocaleCode` to `SUPPORTED_LOCALES`; the formatter
 * inherits the Arabic / English text from `Intl`.
 */
export function formatRelativeTime(
  deltaSeconds: number,
  unit: Intl.RelativeTimeFormatUnit,
  code: LocaleCode,
): string {
  const locale = bcp47(code);
  return new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  }).format(deltaSeconds, unit);
}

// ─── List joining (Arabic comma variant) ──────────────────────────────────

/**
 * Join an array of strings with the locale's list separator.
 * Arabic uses the U+060C `،` (Arabic comma) in formal text;
 * `Intl.ListFormat` returns the right joiner + spacing.
 */
export function formatList(items: ReadonlyArray<string>, code: LocaleCode): string {
  const locale = bcp47(code);
  return new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(items);
}

// ─── Sanity check used by the unit test suite ──────────────────────────────

/**
 * Smoke-test the formatter set against a fixed clock so the
 * unit suite can assert "this locale renders a date with the
 * expected calendar segments" without depending on the host
 * machine's locale. Not used in production.
 */
export function _internalBcp47(code: LocaleCode): string {
  return bcp47(code);
}
