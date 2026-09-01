import "server-only";

import { cookies } from "next/headers";

import { serverEnv } from "@/lib/validation/env";
import { getByCode, resolveLocale, SUPPORTED_LOCALES, type LocaleCode } from "@/lib/i18n/locales";

/**
 * `laratik_locale` — the public, unauthenticated interface-locale
 * preference. It is read on every request to:
 *
 *   - render the correct `<html lang dir>` and message catalog on
 *     public surfaces (landing, sign-in, privacy, terms,
 *     data-deletion) when the user is not signed in;
 *   - render the correct catalog for a freshly signed-in user
 *     whose `users.locale` row is still the default (`"en"`) but
 *     who has set the public preference to Arabic before signing
 *     in — the profile form's save action writes both, but the
 *     cookie is also the *first paint* answer for the very next
 *     request.
 *
 * The cookie is **not** the interface locale for an authenticated
 * request — that is the `users.locale` row, written by the
 * profile form. The profile wins. The cookie's job on
 * authenticated surfaces is to be the answer when the profile
 * has not been set yet (a brand-new user, or one whose profile
 * has been reset to defaults).
 *
 * The cookie never carries an HMAC. Its only consumer is the
 * same server that wrote it; the value is meaningless without
 * the (signed) session cookie. An invalid / stale value is
 * treated as absent — see {@link getPublicLocale}.
 */

export const PUBLIC_LOCALE_COOKIE_NAME = "laratik_locale";

/** 365 days, in seconds. The cookie is a sticky preference,
 *  not a session token. */
export const PUBLIC_LOCALE_COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * Read the public locale preference from the request cookies.
 * Returns `null` when the cookie is absent, when its value is
 * not a supported code, or when the value is empty / whitespace.
 * Never throws.
 */
export async function getPublicLocale(): Promise<LocaleCode | null> {
  const store = await cookies();
  const entry = store.get(PUBLIC_LOCALE_COOKIE_NAME);
  if (!entry?.value) return null;
  const trimmed = entry.value.trim();
  if (!trimmed) return null;
  // Defensive: even though `setPublicLocale` validates, a
  // tampered / legacy value must not crash the request. We
  // match against the closed set rather than Zod-parsing.
  const isSupported = SUPPORTED_LOCALES.some((l) => l.code === trimmed);
  return isSupported ? (trimmed as LocaleCode) : null;
}

/**
 * Set the public locale cookie. Refuses to write a value that
 * is not in {@link SUPPORTED_LOCALES}. Returns `true` on a
 * successful set, `false` on a rejected value. The caller
 * (server action) is responsible for surfacing the failure to
 * the user; the layout / resolver treats the cookie as absent
 * either way.
 */
export async function setPublicLocale(code: string): Promise<boolean> {
  if (!SUPPORTED_LOCALES.some((l) => l.code === code)) return false;
  const store = await cookies();
  store.set({
    name: PUBLIC_LOCALE_COOKIE_NAME,
    value: code,
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PUBLIC_LOCALE_COOKIE_MAX_AGE_SECONDS,
  });
  return true;
}

/**
 * Delete the public locale cookie. Idempotent: safe to call
 * when the cookie is not set.
 */
export async function clearPublicLocale(): Promise<void> {
  const store = await cookies();
  store.delete(PUBLIC_LOCALE_COOKIE_NAME);
}

/**
 * Read the public locale and return a fully-resolved
 * {@link LocaleDescriptor}, falling back to English. This is
 * the single function the public layout / landing / sign-in
 * surfaces use — they never call `getPublicLocale` directly.
 */
export async function getPublicLocaleDescriptor() {
  const code = await getPublicLocale();
  return code ? getByCode(code) : resolveLocale(null);
}
