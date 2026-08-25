"use server";

import { revalidatePath } from "next/cache";
import { auth, signOut } from "@/lib/auth/config";
import {
  changeOwnPassword,
  getPasswordState,
  updateOwnProfile,
  type Locale,
} from "@/lib/auth/profile";
import { setNotificationPreferencesForUser } from "@/lib/notifications/service";

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
 */

const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ["en"];

export type ProfileActionState =
  { saved: true } | { error: string; field?: string } | Record<string, never>;

export type PasswordActionState =
  | { saved: true; mode: "set" | "change" }
  | {
      error: string;
      field?: string;
    }
  | Record<string, never>;

export type NotificationPreferencesActionState =
  { saved: true } | { error: string } | Record<string, never>;

export async function updateProfileAction(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in again to save your profile." };

  const rawLocale = String(formData.get("locale") ?? "en");
  const locale = SUPPORTED_LOCALES.find((l) => l === rawLocale);
  if (!locale) return { error: "That locale isn't supported yet.", field: "locale" };

  const result = await updateOwnProfile(session.user.id, {
    displayName: String(formData.get("displayName") ?? ""),
    name: String(formData.get("name") ?? ""),
    image: String(formData.get("image") ?? ""),
    locale,
  });
  if (!result.ok) {
    if (result.field) {
      return { error: result.message, field: result.field };
    }
    return { error: result.message };
  }
  revalidatePath("/app/account");
  revalidatePath("/app");
  return { saved: true };
}

export async function changePasswordAction(
  _previous: PasswordActionState,
  formData: FormData,
): Promise<PasswordActionState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "Sign in again to change your password." };

  const state = await getPasswordState(session.user.id);
  if (!state) return { error: "Account not found." };

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const result = await changeOwnPassword(session.user.id, {
    ...(state.hasPassword ? { current } : {}),
    next,
    confirm,
  });
  if (!result.ok) {
    if (result.reason === "weak") return { error: result.message, field: "next" };
    if (result.reason === "mismatch") return { error: result.message, field: "confirm" };
    if (result.reason === "current_wrong") return { error: result.message, field: "current" };
    return { error: result.message };
  }
  return { saved: true, mode: result.mode };
}

export async function signOutAction(): Promise<void> {
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
  if (!session?.user?.id) return { error: "Sign in again to save your preferences." };
  try {
    await setNotificationPreferencesForUser(session.user.id, {
      emailOnMention: formData.get("emailOnMention") === "on",
      dailyDigest: formData.get("dailyDigest") === "on",
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/app/account");
  return { saved: true };
}
