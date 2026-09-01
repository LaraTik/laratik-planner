/**
 * Client-side locale helper for surfaces that don't have access to
 * a server-rendered `t` — primarily the (app) error boundary, where
 * any failed server render leaves the boundary as the only place
 * the user can read what went wrong.
 *
 * Reads the `laratik_locale` public cookie synchronously and binds a
 * translator. Falls back to English when:
 *   - the cookie is absent (signed-out user, pre-Phase-1 visitors),
 *   - the value is not a supported `LocaleCode`,
 *   - we're on the server (no `document`).
 *
 * The cookie is set by the public locale switcher
 * (`/signin`/landing surfaces) and updated by the profile save
 * action. It's a sticky preference, not a session token.
 *
 * IMPORTANT: this helper is a last-resort UI translator. Server
 * Components should always use `tForActive()` so the locale
 * follows the authenticated user's profile. This file is for
 * error boundaries + other client components where the server
 * context is unavailable.
 *
 * Note: the cookie name is duplicated here instead of imported
 * from `./cookie` so this module is `server-only`-free. Importing
 * the server-side cookie module would pull `next/headers` into
 * the client bundle and break the (app) error boundary build.
 */
import { tFor } from "@/messages";
import type { LocaleCode } from "@/lib/i18n/locales";

// Mirror of `PUBLIC_LOCALE_COOKIE_NAME` in `cookie.ts`. If the
// cookie name ever changes, update this constant too.
const PUBLIC_LOCALE_COOKIE_NAME = "laratik_locale";

const SUPPORTED: ReadonlySet<LocaleCode> = new Set(["en", "ar"]);

export function getClientT(): (key: string, params?: Record<string, string | number>) => string {
  if (typeof document === "undefined") {
    return tFor("en");
  }
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${PUBLIC_LOCALE_COOKIE_NAME}=`));
  const raw = match ? decodeURIComponent(match.slice(PUBLIC_LOCALE_COOKIE_NAME.length + 1)) : "";
  if (SUPPORTED.has(raw as LocaleCode)) {
    return tFor(raw as LocaleCode);
  }
  return tFor("en");
}
