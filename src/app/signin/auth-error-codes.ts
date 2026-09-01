/**
 * User-facing copy for NextAuth v5 error codes surfaced via
 * `/signin?error=<code>`. Codes not in this map fall back to a generic
 * message so we never leak an internal error string to the user.
 *
 * Reference: https://authjs.dev/reference/core/errors
 *
 * Both legacy (NextAuth v4) and modern (@auth/core 0.41.x, the version
 * that ships under `next-auth@5.0.0-beta.32`) names are listed so:
 *   - any code we redirect to ourselves (e.g. the rate-limit redirect
 *     in `src/app/signin/page.tsx` uses the legacy `EmailSignin`) keeps
 *     working without a rename; and
 *   - any code that @auth/core starts surfacing after a beta upgrade
 *     is already mapped to a useful message.
 *
 * The keys here are the *NextAuth codes* (not catalog keys). The
 * renderer in `authError(t, code)` maps each code to a catalog key
 * (`auth.errorCodes.<Code>`) and falls back to `auth.errorCodes.Default`
 * for an unknown code. This keeps NextAuth's protocol stable while
 * letting translators own the actual copy.
 */

export const AUTH_ERROR_DEFAULT = "Default" as const;

/**
 * Resolve a NextAuth error code to a localized message. The
 * `t` translator is the bound translator from
 * `tForActive()`; passing it in keeps this module pure of
 * any cookie / session / DB access.
 *
 * Unknown codes are routed to `Default` so we never leak
 * an internal error string to the user. The fallback is
 * implemented by reading both keys and picking the one that
 * is **not** the catalog's loud `[…]` missing-key wrapper,
 * rather than relying on the catalog's own default behavior
 * — the loud wrapper is useful in product copy but harmful
 * for an error code surface that must never expose internal
 * identifiers.
 */
export function authError(
  t: (key: string, params?: Record<string, string | number>) => string,
  code: string | undefined | null,
): string {
  if (!code) return t(`auth.errorCodes.${AUTH_ERROR_DEFAULT}`);
  const direct = t(`auth.errorCodes.${code}`);
  // `makeTranslator` wraps a missing key in `[…]`. Treat
  // the wrapped string as "not found" and fall back to the
  // catalog's Default entry.
  if (direct.startsWith(`[auth.errorCodes.${code}]`)) {
    return t(`auth.errorCodes.${AUTH_ERROR_DEFAULT}`);
  }
  return direct;
}
