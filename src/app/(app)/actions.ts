"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import {
  markAllNotificationsRead,
  markNotificationsRead,
  MarkReadSchema,
} from "@/lib/notifications/service";

/**
 * Notification actions (Goal 8).
 *
 * Wired into the topbar bell icon. Marking a notification as read
 * does not navigate; marking all as read does not navigate either.
 */

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  return { id: session.user.id };
}

export async function markAllReadAction() {
  const actor = await requireSession();
  await markAllNotificationsRead(actor);
  revalidatePath("/app");
  return { ok: true };
}

export async function markReadAction(input: { ids: string[] }) {
  const actor = await requireSession();
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  await markNotificationsRead(actor, parsed.data);
  revalidatePath("/app");
  return { ok: true };
}
