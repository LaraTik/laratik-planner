"use server";

import { revalidatePath } from "next/cache";

import { setPublicLocale } from "@/lib/i18n/cookie";
import { SUPPORTED_LOCALES, type LocaleCode } from "@/lib/i18n/locales";

/**
 * Server action: set the public interface-locale preference.
 *
 * Validation contract:
 *   1. `locale` MUST be one of `SUPPORTED_LOCALES` — anything
 *      else returns `{ ok: false, reason: "invalid" }` and does
 *      not write a cookie.
 *   2. `returnTo` MUST be a same-origin relative path: it must
 *      start with `/`, must not start with `//` (protocol-
 *      relative), must not contain a backslash (some browsers
 *      treat `\` as `/`), and must not contain CRLF.
 *
 * After a successful write, the action calls
 * `revalidatePath("/", "layout")` so the root layout re-runs
 * its resolver on the next render. The client then calls
 * `router.refresh()` for symmetry, but the server-side
 * revalidation is the structural source of truth.
 *
 * The action does NOT redirect. The current URL is the
 * correct URL after a language switch — only the cookie and
 * the root `lang` / `dir` change. A redirect would lose the
 * user's scroll position and any in-flight form state.
 */

export type SetPublicLocaleResult =
  | { ok: true; locale: LocaleCode }
  | { ok: false; reason: "invalid" | "return_path" | "server_error" };

const RELATIVE_PATH_RE = /^\/(?!\/)[^\r\n\\]*$/;

function isValidReturnPath(value: string): boolean {
  if (!value) return false;
  if (!RELATIVE_PATH_RE.test(value)) return false;
  // Reject CR/LF and null bytes defensively even though the
  // regex already filters them — defense in depth in case
  // a future Node version normalises the inputs differently.
  if (/[\u0000-\u001f\u007f]/.test(value)) return false;
  return true;
}

export async function setPublicLocaleAction(input: {
  locale: string;
  returnTo: string;
}): Promise<SetPublicLocaleResult> {
  const isSupported = SUPPORTED_LOCALES.some((l) => l.code === input.locale);
  if (!isSupported) {
    return { ok: false, reason: "invalid" };
  }
  if (!isValidReturnPath(input.returnTo)) {
    return { ok: false, reason: "return_path" };
  }
  try {
    const ok = await setPublicLocale(input.locale);
    if (!ok) return { ok: false, reason: "server_error" };
    // Repaint the root layout so the new <html lang dir>
    // lands on the next render. The `returnTo` path is
    // used as the revalidation scope so any nested layout
    // (e.g. /signin) also re-resolves.
    revalidatePath(input.returnTo, "layout");
    return { ok: true, locale: input.locale as LocaleCode };
  } catch {
    return { ok: false, reason: "server_error" };
  }
}
