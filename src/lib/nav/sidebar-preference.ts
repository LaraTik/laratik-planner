import { cookies } from "next/headers";

/**
 * Sidebar collapse / expand preference.
 *
 * Persisted as an HTTP-only-free cookie so the layout (RSC) can
 * read it server-side and apply the correct width class on the
 * first paint — no client-side flash from expanded → collapsed.
 *
 * The cookie is a single byte:
 *   "1" → collapsed
 *   "0" → expanded (default)
 *
 * We deliberately use a cookie and not localStorage so:
 *   1. The first paint matches the user's last choice.
 *   2. The state survives an incognito-with-same-account session
 *      switch.
 *   3. We do not need a preferences table migration.
 *
 * The "client opt-in" toggle writes the cookie via a server
 * action (see `setSidebarCollapsed`) so it stays in sync across
 * tabs.
 */

export const SIDEBAR_COLLAPSED_COOKIE = "studio_sidebar_collapsed";
export const SIDEBAR_COLLAPSED_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export async function readSidebarCollapsed(): Promise<boolean> {
  const store = await cookies();
  return store.get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1";
}

export type SidebarPreference = {
  collapsed: boolean;
};

/**
 * Server-side default. The user can opt in via the toggle in the
 * sidebar header; the cookie then takes over.
 */
export const DEFAULT_SIDEBAR_PREFERENCE: SidebarPreference = { collapsed: false };
