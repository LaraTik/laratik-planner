import "server-only";

import type { LocaleCode } from "@/lib/i18n/locales";
import { resolveActiveLocale } from "@/lib/i18n/resolve-active-locale";
import { makeTranslator } from "@/messages";

/**
 * Server Component helper. Resolves the active interface
 * locale for the current request and returns a translator
 * bound to it. This is the single import every Server
 * Component page should use — it folds the
 * `resolveActiveLocale()` + `tFor()` pair into one call so
 * callsites do not have to re-derive the locale or worry
 * about precedence.
 *
 * Lives in `src/lib/i18n/` (not `src/messages/`) so the base
 * catalog module can stay pure of any server-only / next-auth
 * import. The vitest suite loads `@/messages` directly
 * without the next-auth env.js shim; importing
 * `resolveActiveLocale` transitively pulls next-auth and
 * trips the strict import resolution. Splitting the
 * server helper into its own module keeps the catalog tests
 * green.
 *
 * The helper is intentionally async: `resolveActiveLocale`
 * reads the session, the user row, and the cookie store.
 * Awaiting once at the top of a page is cheaper than
 * awaiting the same chain in every nested server component.
 */
export async function tForActive(): Promise<{
  t: ReturnType<typeof makeTranslator>;
  code: LocaleCode;
  dir: "ltr" | "rtl";
  source: "user" | "cookie" | "fallback";
}> {
  const resolved = await resolveActiveLocale();
  return {
    t: makeTranslator(resolved.code),
    code: resolved.code,
    dir: resolved.dir,
    source: resolved.source,
  };
}
