"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { SIDEBAR_COLLAPSED_COOKIE, SIDEBAR_COLLAPSED_MAX_AGE_SECONDS } from "./sidebar-preference";

/**
 * Toggle / set the sidebar collapsed state.
 *
 * Server action so the cookie is HttpOnly-friendly and the
 * change takes effect on the next RSC render. The client
 * component calls `router.refresh()` after this resolves.
 */
export async function setSidebarCollapsed(collapsed: boolean): Promise<void> {
  const store = await cookies();
  store.set({
    name: SIDEBAR_COLLAPSED_COOKIE,
    value: collapsed ? "1" : "0",
    httpOnly: false, // we want the client to be able to read it too
    sameSite: "lax",
    path: "/",
    maxAge: SIDEBAR_COLLAPSED_MAX_AGE_SECONDS,
  });
  revalidatePath("/", "layout");
}
