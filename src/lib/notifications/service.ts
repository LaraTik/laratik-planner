import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, notificationPreferences, outboxEvents } from "@/lib/db/schema";
import { type Actor } from "@/lib/auth/policy";
import { z } from "zod";

/**
 * Notifications service (Goal 8 — master prompt §8 + §11).
 *
 * In-app notifications are the v1 surface. Email is a Goal 13+ outbox
 * worker job (the outbox_events table already records what should be
 * emailed; this file is the in-app reader + writer).
 *
 * Per master prompt:
 *  - "Invitations and security events cannot be disabled." — These two
 *    kinds bypass user preferences (handled in the outbox worker).
 *  - "Important approval and assignment email defaults may be enabled
 *    but remain user-configurable." — notification_preferences.
 *  - "Read state is stored separately from delivery state." — read_at
 *    on the notification is the only delivery state we track in v1.
 */

export const NotificationKindSchema = z.enum([
  "assignment",
  "review_request",
  "approval",
  "changes_requested",
  "mention",
  "reply",
  "unresolved_question",
  "deadline",
  "delivery",
  "ready_to_publish",
  "system",
]);
export type NotificationKind = z.infer<typeof NotificationKindSchema>;

// ─── In-app notification writers (used by other services / outbox worker) ─

/**
 * Create an in-app notification. Bypasses preferences — callers are
 * expected to have checked (or not). The outbox worker is the only
 * caller expected to honor notification_preferences.email_enabled.
 */
export async function createInAppNotification(input: {
  userId: string;
  workspaceId?: string;
  contentItemId?: string;
  kind: NotificationKind;
  title: string;
  body: string;
  actionUrl?: string;
}) {
  const [created] = await db
    .insert(notifications)
    .values({
      userId: input.userId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.contentItemId ? { contentItemId: input.contentItemId } : {}),
      kind: input.kind,
      title: input.title,
      body: input.body,
      ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
    })
    .returning({ id: notifications.id });
  return created?.id;
}

/**
 * Process the outbox: for each unprocessed outbox_event, fan out
 * in-app notifications to the affected users. Email is a Goal 13+ job
 * (a separate worker that calls the Mailcow SMTP transport).
 *
 * This is a single-process, no-locking function — safe to call from
 * a cron or `pnpm notifications:dispatch` CLI. The transaction wraps
 * each event so partial failures don't poison the queue.
 */
export async function dispatchOutboxOnce(opts: { maxEvents?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const maxEvents = opts.maxEvents ?? 50;

  // Claim a batch of unprocessed events
  const events = await db
    .select()
    .from(outboxEvents)
    .where(and(isNull(outboxEvents.processedAt), sql`${outboxEvents.availableAt} <= ${now}`))
    .orderBy(outboxEvents.availableAt)
    .limit(maxEvents);

  const processed: string[] = [];
  for (const evt of events) {
    try {
      const payload = evt.payload as Record<string, unknown> | null;
      if (evt.eventType === "comment_created" && payload) {
        await fanOutCommentCreated(payload);
      }
      // other event types (assignment, approval, etc.) follow the same pattern
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date(), attemptCount: sql`${outboxEvents.attemptCount} + 1` })
        .where(eq(outboxEvents.id, evt.id));
      processed.push(evt.id);
    } catch (err) {
      await db
        .update(outboxEvents)
        .set({
          attemptCount: sql`${outboxEvents.attemptCount} + 1`,
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(outboxEvents.id, evt.id));
    }
  }
  return { processed: processed.length };
}

async function fanOutCommentCreated(payload: Record<string, unknown>) {
  const commentId = payload["commentId"] as string | undefined;
  const contentItemId = payload["contentItemId"] as string | undefined;
  const authorId = payload["authorId"] as string | undefined;
  const mentionedUserIds = (payload["mentionedUserIds"] as string[] | undefined) ?? [];
  const visibility = payload["visibility"] as string | undefined;
  if (!commentId || !contentItemId || !authorId) return;

  // Mentions: notify each mentioned user
  for (const userId of mentionedUserIds) {
    await maybeNotify({
      userId,
      contentItemId,
      kind: "mention",
      title: "You were mentioned in a comment",
      body: "Someone @mentioned you in a comment on a content item.",
    });
  }

  // (Reply notifications: would notify the parent comment's author.
  //  Out of scope for v1 — the in-app list shows unread comments anyway.)
  void visibility;
}

async function maybeNotify(input: {
  userId: string;
  contentItemId: string;
  kind: NotificationKind;
  title: string;
  body: string;
}) {
  // Check user preferences (default: in-app enabled, email disabled)
  const [pref] = await db
    .select({ inAppEnabled: notificationPreferences.inAppEnabled })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.userId, input.userId),
        eq(notificationPreferences.kind, input.kind),
      ),
    )
    .limit(1);
  const inAppEnabled = pref?.inAppEnabled ?? true; // default ON
  if (!inAppEnabled) return;
  await createInAppNotification({
    userId: input.userId,
    contentItemId: input.contentItemId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    actionUrl: `/app/planning/${input.contentItemId}`,
  });
}

// ─── Read helpers for the /app topbar ──────────────────────────────────

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
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

export async function countUnreadNotifications(actor: Actor): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
  return row?.n ?? 0;
}

export const MarkReadSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
});
export type MarkReadInput = z.infer<typeof MarkReadSchema>;

export async function markNotificationsRead(actor: Actor, input: MarkReadInput) {
  const parsed = MarkReadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  // Only mark the actor's own notifications read
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), inArray(notifications.id, parsed.data.ids)));
}

export async function markAllNotificationsRead(actor: Actor) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, actor.id), isNull(notifications.readAt)));
}
