/**
 * Message catalog loader.
 *
 * Hand-rolled for Phase 1 — the plan's "Common + Navigation"
 * namespace pair is small (≈ 80 keys) and a bespoke loader
 * gives us a single, testable source of truth without pulling
 * `next-intl`'s plugin + middleware into the build before the
 * rest of the catalog is wired up.
 *
 * `next-intl` will replace this module in a follow-up commit
 * once the rest of the namespaces (Auth, Profile, Planning,
 * Content, …) are translated. The exported `t()` signature is
 * the same one `next-intl` exposes for `getTranslations` /
 * `useTranslations`, so the migration is a body-only change
 * at every call site.
 *
 * The loader never throws on a missing key. A missing key
 * returns the **English fallback** wrapped in `[…]` so the
 * untranslated key is loud and obvious in QA but does not
 * break the page. The unit test suite asserts that
 * `en` and `ar` have identical key structure, so a missing
 * Arabic key is caught at test time, not at runtime.
 *
 * This module is **pure of any server-only or auth import**
 * so it can be loaded from any context (Client Components,
 * Server Components, vitest without the next-auth env.js
 * shim, etc.). The server-only `tForActive()` helper that
 * resolves the active locale and binds a translator lives in
 * `src/lib/i18n/t-for-active.ts`; the split keeps the test
 * surface small.
 */
import en from "./en/common.json";
import ar from "./ar/common.json";
import { resolveLocale, type LocaleCode } from "@/lib/i18n/locales";

type Catalog = Record<string, unknown>;

const CATALOGS: Record<LocaleCode, Catalog> = {
  en: en as Catalog,
  ar: ar as Catalog,
};

export type Namespaces = "common" | "navigation" | "languageSwitcher" | "auth";

/**
 * Read a dotted key from a catalog. Returns `undefined` when
 * any segment is missing. Pure, no I/O.
 */
function readPath(catalog: Catalog, dotted: string): string | undefined {
  const segments = dotted.split(".");
  let current: unknown = catalog;
  for (const seg of segments) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return typeof current === "string" ? current : undefined;
}

/**
 * Translation function. The signature mirrors
 * `next-intl`'s `t(key, params)` so the future migration is
 * a body-only change.
 *
 * ICU-style placeholders are supported in a deliberately
 * narrow form: `{name}` interpolations only. Plural
 * selection (`{count, plural, one {#} other {#}}`) and
 * rich-text placeholders (`<b>…</b>`) are added in the
 * `next-intl` migration.
 *
 * Missing-key contract: when the requested locale is missing
 * the key, the function falls back to English and wraps the
 * missing key in `[…]` so the untranslated key is visible
 * in QA. The same `[…]` wrapper is used when both locales
 * are missing the key (which should be impossible after
 * the catalog test gate).
 */
export function makeTranslator(locale: LocaleCode) {
  const primary = CATALOGS[locale];
  const fallback = CATALOGS.en;
  return function t(key: string, params?: Record<string, string | number>): string {
    const primaryValue = readPath(primary, key);
    const fallbackValue = readPath(fallback, key);
    if (primaryValue != null) return interpolate(primaryValue, params);
    if (fallbackValue != null) return `[${key}] ${interpolate(fallbackValue, params)}`;
    return `[${key}]`;
  };
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    return value == null ? match : String(value);
  });
}

/**
 * Build a translator bound to the resolved locale. Server
 * Components call this from their layout / page; Client
 * Components receive the result through props or through
 * the `LocaleProvider` in a follow-up commit.
 */
export function tFor(
  locale: LocaleCode,
): (key: string, params?: Record<string, string | number>) => string {
  return makeTranslator(locale);
}

/**
 * Resolve a locale and return its translator. Defaults to
 * English when the input is null / unknown.
 */
export function tForResolved(locale: string | null | undefined) {
  return makeTranslator(resolveLocale(locale).code);
}

export { CATALOGS };
