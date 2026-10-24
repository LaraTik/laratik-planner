import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";
import type { Actor } from "@/lib/auth/policy";
import { tFor } from "@/messages";
import type { NotificationKind } from "@/lib/notifications/types";

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  messageKey: string | null;
  messageParams: Record<string, string | number> | null;
  actionUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
  workspaceId: string | null;
  contentItemId: string | null;
};

export async function listNotificationsForUser(
  actor: Actor,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<NotificationRow[]> {
  const limit = opts.limit ?? 50;
  const where = opts.unreadOnly
    ? and(eq(notifications.userId, actor.id), isNull(notifications.readAt))
    : eq(notifications.userId, actor.id);
  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows as NotificationRow[];
}

/** Renders stored system copy for the recipient locale with a legacy fallback. */
export function renderNotificationCopy(
  row: Pick<NotificationRow, "title" | "body" | "messageKey" | "messageParams">,
  locale: string,
): { title: string; body: string } {
  if (!row.messageKey) return { title: row.title, body: row.body };
  const t = tFor(locale as Parameters<typeof tFor>[0]);
  const title = t(row.messageKey + ".title", row.messageParams ?? undefined);
  const body = t(row.messageKey + ".body", row.messageParams ?? undefined);
  if (title.startsWith("[") || body.startsWith("[")) {
    return { title: row.title, body: row.body };
  }
  return { title, body };
}

export async function countUnreadNotifications(actor: Actor): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export const MarkReadSchema = z.object({
  ids: z.array(z.string().guid()).min(1).max(200),
});
export type MarkReadInput = z.infer<typeof MarkReadSchema>;

export async function markNotificationsRead(actor: Actor, input: MarkReadInput): Promise<void> {
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), inArray(notifications.id, parsed.data.ids)));
}

export async function markAllNotificationsRead(actor: Actor): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
}

export const MarkReadOneSchema = z.object({
  notificationId: z.string().guid(),
});
export type MarkReadOneInput = z.infer<typeof MarkReadOneSchema>;

/** Idempotently marks one row, scoped to the authenticated actor. */
export async function markNotificationRead(actor: Actor, input: MarkReadOneInput): Promise<void> {
  const parsed = MarkReadOneSchema.safeParse(input);
  if (!parsed.success)
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, actor.id), eq(notifications.id, parsed.data.notificationId)),
    );
}
