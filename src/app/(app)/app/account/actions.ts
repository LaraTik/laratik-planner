"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth/config";
import {
  changeOwnPassword,
  getPasswordState,
  updateOwnProfile,
  type ProfileErrorCode,
  type Locale,
} from "@/lib/auth/profile";
import { setNotificationPreferencesForUser } from "@/lib/notifications/service";
import { setUser } from "@/lib/observability/sentry";
import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { setPublicLocale } from "@/lib/i18n/cookie";

/**
 * Own-profile server actions. All three:
 *  - check the session server-side (never trust the client)
 *  - return a serialisable state for `useActionState` instead of
 *    redirecting on success (so the success banner can be rendered
 *    inline above the form, matching the workspace settings pattern)
 *  - use revalidatePath so the JWT/session-derived names on the
 *    sidebar refresh after a save
 *
 * Sign out is a thin wrapper around the NextAuth signOut() helper.
 * It does not return state — it throws NEXT_REDIRECT, which the
 * framework turns into a 307 to /signin. We keep the wrapper as a
 * server action so both the Account page and the User menu can call
 * the same code path.
 *
 * After a successful profile save the action also writes the
 * public-locale cookie so the next request — including the
 * one the client triggers through `router.refresh()` — paints
 * the root `<html lang dir>` from the profile's choice rather
 * than from a stale public preference.
 */

export type ProfileActionState =
  | { saved: true; warningCode?: "localeCookieSyncFailed" }
  | { errorCode: ProfileErrorCode | "sessionExpired"; field?: string }
  | Record<string, never>;

export type PasswordActionState =
  | { saved: true; mode: "set" | "change" }
  | {
      errorCode:
        | "sessionExpired"
        | "accountNotFound"
        | "passwordWeak"
        | "passwordMismatch"
        | "currentPasswordRequired"
        | "currentPasswordIncorrect";
      field?: string;
    }
  | Record<string, never>;

export type NotificationPreferencesActionState =
  | { saved: true }
  | { errorCode: "sessionExpired" | "savePreferencesFailed" }
  | Record<string, never>;

export async function updateProfileAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user?.id) return { errorCode: "sessionExpired" };

  const rawLocale = String(formData.get("locale") ?? "en");
  const locale: Locale | undefined = SUPPORTED_LOCALES.find((l) => l.code === rawLocale)?.code;
  if (!locale) return { errorCode: "unsupportedLocale", field: "locale" };

  const result = await updateOwnProfile(session.user.id, {
    displayName: String(formData.get("displayName") ?? ""),
    name: String(formData.get("name") ?? ""),
    image: String(formData.get("image") ?? ""),
    locale,
  });
  if (!result.ok) {
    if (result.field) {
      return { errorCode: result.code, field: result.field };
    }
    return { errorCode: result.code };
  }
  // The DB row is the source of truth for authenticated
  // requests. The cookie is the source of truth for the
  // *next* public render (sign-out, deep link from email,
  // etc.) and is also what the very next authenticated
  // request reads if the JWT has not yet re-decoded the
  // updated `users.locale` — Next.js caches the JWT
  // payload for the request, so without the cookie the
  // first paint after a language switch would still show
  // the old language until the next navigation.
  let warningCode: "localeCookieSyncFailed" | undefined;
  try {
    if (!(await setPublicLocale(locale))) warningCode = "localeCookieSyncFailed";
  } catch {
    warningCode = "localeCookieSyncFailed";
  }
  revalidatePath("/app/account");
  revalidatePath("/app", "layout");
  return warningCode ? { saved: true, warningCode } : { saved: true };
}

export async function changePasswordAction(
  _previous: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const session = await auth();
  if (!session?.user?.id) return { errorCode: "sessionExpired" };

  const state = await getPasswordState(session.user.id);
  if (!state) return { errorCode: "accountNotFound" };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const result = await changeOwnPassword(session.user.id, {
    ...(state.hasPassword ? { current } : {}),
    next,
    confirm,
  });
  if (!result.ok) {
    if (result.reason === "weak") return { errorCode: result.code, field: "next" };
    if (result.reason === "mismatch") return { errorCode: result.code, field: "confirm" };
    if (result.reason === "current_wrong") return { errorCode: result.code, field: "current" };
    return { errorCode: result.code };
  }
  return { saved: true, mode: result.mode };
}

export async function signOutAction(): Promise<void> {
  // Clear the Sentry user context BEFORE the redirect so subsequent
  // errors from the sign-in page (or any background work in the
  // same process) aren't attributed to the user who just left.
  setUser(null);
  // signOut throws NEXT_REDIRECT, which is what we want — Next.js
  // turns it into a 307 to /signin. The throw is type `never`, so the
  // function is typed as Promise<void> for callers.
  await signOut({ redirectTo: "/signin" });
}

// ─── Notification preferences (FEAT-08) ─────────────────────────────────
/**
 * Save the two notification preferences surfaced on the account page
 * ("Email me when I'm mentioned" + "Send me a daily digest"). The
 * form posts the booleans as strings ("on" or absent); we coerce here
 * so the client stays simple. Missing fields are treated as off — the
 * checkbox is unchecked, so the absence is intentional.
 */
export async function setNotificationPreferencesAction(
  _previous: NotificationPreferencesActionState,
  formData: FormData,
): Promise<NotificationPreferencesActionState> {
  const session = await auth();
  if (!session?.user?.id) return { errorCode: "sessionExpired" };
  try {
    await setNotificationPreferencesForUser(session.user.id, {
      emailOnMention: formData.get("emailOnMention") === "on",
      dailyDigest: formData.get("dailyDigest") === "on",
    });
  } catch (e) {
    console.error("Failed to save notification preferences", e);
    return { errorCode: "savePreferencesFailed" };
  }
  revalidatePath("/app/account");
  return { saved: true };
}
