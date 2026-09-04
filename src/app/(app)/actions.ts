"use server";

import { updateTag } from "next/cache";
import { auth } from "@/lib/auth/config";
import {
  markAllNotificationsRead,
  markNotificationsRead,
  MarkReadSchema,
} from "@/lib/notifications/service";
import { notificationsUserTag } from "@/lib/notifications/cache";

/**
 * Notification actions (Goal 8).
 *
 * Wired into the topbar bell icon. Marking a notification as read
 * does not navigate; marking all as read does not navigate either.
 *
 * R9 — the previous implementation called
 * `revalidatePath("/app")`, which invalidated the entire `/app/*`
 * subtree on every bell click. The planning detail / brand kit /
 * calendar pages all re-rendered for nothing. The new path is
 * `updateTag("notifications:user:<id>")`, which invalidates
 * only this user's cached bell reads. `updateTag` is the
 * server-action equivalent of `revalidateTag` — Next.js 15
 * introduced it specifically for read-your-own-writes semantics
 * inside server actions, which is exactly what a mark-read
 * click needs.
 */

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { id: session.user.id };
}

export async function markAllReadAction() {
  const actor = await requireSession();
  await markAllNotificationsRead(actor);
  updateTag(notificationsUserTag(actor.id));
  return { ok: true };
}

export async function markReadAction(input: { ids: string[] }) {
  const actor = await requireSession();
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  await markNotificationsRead(actor, parsed.data);
  updateTag(notificationsUserTag(actor.id));
  return { ok: true };
}
