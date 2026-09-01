/**
 * Client-side locale helper for surfaces that don't have access to
 * a server-rendered `t` — primarily the (app) error boundary, where
 * any failed server render leaves the boundary as the only place
 * the user can read what went wrong.
 *
 * Reads the server-rendered `<html lang>` synchronously and binds a
 * translator. Falls back to English when:
 *   - the language attribute is absent or unsupported,
 *   - the value is not a supported `LocaleCode`,
 *   - we're on the server (no `document`).
 *
 * The root layout resolves the language from the authenticated
 * profile or public preference before rendering the boundary. Reading
 * the DOM avoids depending on the HttpOnly locale cookie.
 *
 * IMPORTANT: this helper is a last-resort UI translator. Server
 * Components should always use `tForActive()` so the locale
 * follows the authenticated user's profile. This file is for
 * error boundaries + other client components where the server
 * context is unavailable.
 *
 */
import { tFor } from "@/messages";
import type { LocaleCode } from "@/lib/i18n/locales";

const SUPPORTED: ReadonlySet<LocaleCode> = new Set(["en", "ar"]);

export function getClientT(): (key: string, params?: Record<string, string | number>) => string {
  return tFor(getClientLocale());
}

export function getClientLocale(): LocaleCode {
  if (typeof document === "undefined") {
    return "en";
  }
  const raw = document.documentElement.lang.trim().toLowerCase();
  if (SUPPORTED.has(raw as LocaleCode)) {
    return raw as LocaleCode;
  }
  return "en";
}
