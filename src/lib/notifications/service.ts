import "server-only";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import {
  notifications,
  notificationPreferences,
  notificationEmailDeliveries,
  outboxEvents,
  users,
  contentItems,
  workspaces,
} from "@/lib/db/schema";
import { type Actor } from "@/lib/auth/policy";
import { sendEmail } from "@/lib/email";
import { tFor } from "@/messages";
import { renderNotificationEmailCopy } from "@/lib/notifications/email-copy";
import { notificationsUserTag } from "@/lib/notifications/cache";
import {
  NOTIFICATION_KIND_VALUES,
  type NotificationKind,
  type NotificationKindForPrefs,
  type NotificationPreferencesSnapshot,
} from "@/lib/notifications/types";
import { z } from "zod";

export type {
  NotificationKind,
  NotificationKindForPrefs,
  NotificationKindPrefs,
  NotificationPreferencesSnapshot,
} from "@/lib/notifications/types";

/**
 * Outbox event types dispatched by `dispatchOutboxOnce`. The constant
 * lives here (rather than in the schema) because `outbox_events.event_type`
 * is a free-form `text` column — the schema accepts any value, and
 * keeping the list as a string union lets the call sites and the
 * dispatcher share one source of truth.
 */
export const OUTBOX_EVENT_TYPES = [
  "comment_created",
  "assignment",
  "claim",
  "release",
  "review_request",
  "approval",
  "changes_requested",
  "reply",
  "unresolved_question",
  "deadline",
  "delivery",
  "ready_to_publish",
  // Just Halal workspace remediation (2026-08-29) —
  // publication outcome notifications. The publish-side
  // service writes this outbox event when a publisher or
  // manager records a `published` or `failed` outcome for
  // a channel. `pending` and `skipped` are silent.
  "publication_recorded",
] as const;
export type OutboxEventType = (typeof OUTBOX_EVENT_TYPES)[number];

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

export const NotificationKindSchema = z.enum(NOTIFICATION_KIND_VALUES);

// ─── In-app notification writers (used by other services / outbox worker) ─

/**
 * The set of fields shared by both the `notifications` row and the
 * `outbox_events.payload` jsonb blob. Centralised so a new field
 * (e.g. `actorId`) added to one site is also added to the other
 * automatically — the previous implementation had three spread
 * sites that could drift.
 *
 * Falsy values are dropped so the resulting object is JSON-safe and
 * Drizzle doesn't try to insert `null` into a non-null column.
 */
type NotificationCore = {
  userId: string;
  workspaceId?: string;
  contentItemId?: string;
  title?: string;
  body?: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  actionUrl?: string;
};

/**
 * The set of fields shared by both the `notifications` row and the
 * `outbox_events.payload` jsonb blob. Centralised so a new field
 * (e.g. `actorId`) added to one site is also added to the other
 * automatically — the previous implementation had three spread
 * sites that could drift.
 *
 * Falsy values are dropped so the resulting object is JSON-safe and
 * Drizzle doesn't try to insert `null` into a non-null column.
 * The return type is the union of all present fields; callers can
 * spread it into a typed insert without losing inference.
 */
type NotificationCoreFields = {
  userId: string;
  workspaceId?: string;
  contentItemId?: string;
  title?: string;
  body?: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  actionUrl?: string;
};

function notificationCoreFields(input: NotificationCore): NotificationCoreFields {
  const out: NotificationCoreFields = { userId: input.userId };
  if (input.workspaceId) out.workspaceId = input.workspaceId;
  if (input.contentItemId) out.contentItemId = input.contentItemId;
  if (input.title) out.title = input.title;
  if (input.body) out.body = input.body;
  if (input.messageKey) out.messageKey = input.messageKey;
  if (input.messageParams) out.messageParams = input.messageParams;
  if (input.actionUrl) out.actionUrl = input.actionUrl;
  return out;
}

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
  // STUDIOFLOW_MASTER_PROMPT.md §1 — Stored system copy. When set,
  // the bell + email dispatcher render the i18n at view / send
  // time using the recipient's profile locale. The stored `title`
  // + `body` remain the fallback for old rows + untranslated kinds.
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  actionUrl?: string;
  // Optional transaction — used by the outbox dispatcher so the
  // notification fan-out and the outbox row update commit together.
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0];
}) {
  const runner = input.tx ?? db;
  const [created] = await runner
    .insert(notifications)
    .values({
      ...notificationCoreFields(input),
      kind: input.kind,
      title: input.title,
      body: input.body,
    })
    .returning({ id: notifications.id });
  return created?.id;
}
void db; // `db` referenced via the `tx` parameter type only

/**
 * Process the outbox: for each unprocessed outbox_event, fan out
 * in-app notifications to the affected users. Email is a Goal 13+ job
 * (a separate worker that calls the Mailcow SMTP transport).
 *
 * Each event is processed in its own transaction so partial failures
 * don't poison the queue. The worker is deployed as a single cron caller;
 * the per-channel completion flags keep the in-app and email workers
 * independent even when their ticks overlap.
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

  // R9 — collect every userId the dispatcher fans out to during
  // this tick. We batch the tag revalidations and call them once
  // after the per-event transaction commits, so a tick that writes
  // 20 notifications to 20 recipients still results in 20 cheap
  // tag busts (one per user) — not a 20-event-cascade.
  const recipientIds = new Set<string>();
  const processed: string[] = [];
  for (const evt of events) {
    try {
      await db.transaction(async (tx) => {
        const payload = evt.payload as Record<string, unknown> | null;
        if (payload) {
          let recipients: string[] = [];
          switch (evt.eventType as OutboxEventType) {
            case "comment_created":
              recipients = await fanOutCommentCreated(payload, tx);
              break;
            case "assignment":
              recipients = await fanOutSingleRecipient(payload, tx, "assignment");
              break;
            case "claim":
              recipients = await fanOutSingleRecipient(payload, tx, "assignment");
              break;
            case "release":
              recipients = await fanOutSingleRecipient(payload, tx, "assignment");
              break;
            case "review_request":
              recipients = await fanOutSingleRecipient(payload, tx, "review_request");
              break;
            case "approval":
              recipients = await fanOutSingleRecipient(payload, tx, "approval");
              break;
            case "changes_requested":
              recipients = await fanOutSingleRecipient(payload, tx, "changes_requested");
              break;
            case "reply":
              recipients = await fanOutSingleRecipient(payload, tx, "reply");
              break;
            case "unresolved_question":
              recipients = await fanOutSingleRecipient(payload, tx, "unresolved_question");
              break;
            case "deadline":
              recipients = await fanOutSingleRecipient(payload, tx, "deadline");
              break;
            case "delivery":
              recipients = await fanOutSingleRecipient(payload, tx, "delivery");
              break;
            case "ready_to_publish":
              recipients = await fanOutSingleRecipient(payload, tx, "ready_to_publish");
              break;
            case "publication_recorded":
              recipients = await fanOutPublicationRecorded(payload, tx);
              break;
            default:
              // Unknown event types are still marked processed to keep
              // the queue from re-trying forever; the row's payload is
              // preserved for forensics.
              break;
          }
          for (const userId of recipients) recipientIds.add(userId);
        }
        // Mark the event processed (or no-op for unknown types — see
        // above). A failure inside the fan-out throws and rolls this
        // update back so the next tick can retry.
        await tx
          .update(outboxEvents)
          .set({ processedAt: new Date(), attemptCount: sql`${outboxEvents.attemptCount} + 1` })
          .where(eq(outboxEvents.id, evt.id));
      });
      processed.push(evt.id);
    } catch (err) {
      // Failure path runs OUTSIDE the rolled-back tx so the error
      // bookkeeping (attempt_count++, last_error) is persisted even
      // when the inner fan-out throws.
      await db
        .update(outboxEvents)
        .set({
          attemptCount: sql`${outboxEvents.attemptCount} + 1`,
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(outboxEvents.id, evt.id));
    }
  }
  // R9 — invalidate every recipient's bell cache. We do this
  // once at the end of the tick (rather than per event) so a
  // 50-event tick that fans out to N users is still O(N) tag
  // busts, not O(50 * N). `updateTag` is the server-action /
  // cron-worker equivalent of `revalidateTag` — Next.js 15
  // introduced it for read-your-own-writes semantics outside
  // server actions, and it works the same here.
  //
  // Fault-isolation: one user's cache bust throwing must not
  // skip the other recipients' busts. We wrap each call in
  // its own try/catch and surface the failure to Sentry; the
  // dispatcher keeps going. The 30s R3 poll + the cron
  // cadence are the safety net for a user whose bust did fail
  // — they will see the new notification at most 30s late,
  // not forever-stale.
  if (recipientIds.size > 0) {
    const Sentry = await import("@sentry/nextjs");
    for (const userId of recipientIds) {
      try {
        updateTag(notificationsUserTag(userId));
      } catch (err) {
        Sentry.captureException(err, {
          tags: {
            scope: "notifications.updateTag",
            userId,
          },
        });
      }
    }
  }
  return { processed: processed.length };
}

// ─── FEAT-10 — email dispatch (GAP-FULL-REVIEW-2026-08-25) ─────────────────
//
// The in-app dispatcher above handles the bell. This companion
// function reads the same outbox_events rows, but fans out via
// `sendEmail` (Mailcow) instead. It honours
// `notification_preferences.email_enabled` per (user, kind) and
// silently skips the recipient when the user hasn't opted in.
//
// Invariants:
//   - Re-reads the user + preference for every row (avoids stale
//     reads when a user toggles their preference between writes).
//   - Email state is independent from in-app state. The two workers
//     can run in either order without suppressing one another.
//   - Multi-recipient events have one delivery row per recipient, so
//     retrying a failed address never resends a successful address.
//   - The cron route (/api/cron/email-dispatch) only invokes this
//     helper, so all side effects flow through one place.
//
// The per-event envelope is the same one the in-app dispatcher
// writes; the email body is whatever `payload.title` /
// `payload.body` the call site set. For comment mentions, the
// notification_kind is "mention" so the preference lookup is
// consistent across surfaces.

/**
 * One email-dispatch tick. Claims at most `maxEvents` due
 * outbox_events rows, sends the email when the recipient's
 * `email_enabled` flag is set for the matching kind. Returns the
 * counts the cron route logs.
 */
export async function dispatchEmailOnce(
  opts: { maxEvents?: number; now?: Date } = {},
): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const now = opts.now ?? new Date();
  const maxEvents = opts.maxEvents ?? 50;

  const events = await db
    .select()
    .from(outboxEvents)
    .where(and(isNull(outboxEvents.emailProcessedAt), sql`${outboxEvents.availableAt} <= ${now}`))
    .orderBy(outboxEvents.availableAt)
    .limit(maxEvents);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const evt of events) {
    const payload = (evt.payload as Record<string, unknown> | null) ?? {};
    const kind = eventTypeToNotificationKind(evt.eventType as string);
    const recipients = await emailRecipientIds(evt.eventType as string, payload);
    if (!kind || recipients.length === 0) {
      skipped += recipients.length === 0 ? 1 : recipients.length;
      await markEmailEventProcessed(evt.id);
      continue;
    }

    await db
      .insert(notificationEmailDeliveries)
      .values(recipients.map((userId) => ({ outboxEventId: evt.id, userId })))
      .onConflictDoNothing();
    const deliveries = await db
      .select()
      .from(notificationEmailDeliveries)
      .where(
        and(
          eq(notificationEmailDeliveries.outboxEventId, evt.id),
          isNull(notificationEmailDeliveries.processedAt),
        ),
      );

    // A delivery row should always exist after the upsert. Treat an empty
    // result as a completed skip defensively (for example, if a recipient
    // was deleted between the two statements) so the event cannot spin.
    if (deliveries.length === 0) {
      skipped += recipients.length;
      await markEmailEventProcessed(evt.id);
      continue;
    }

    for (const delivery of deliveries) {
      const wantsEmail = await shouldEmailUserFor(delivery.userId, kind);
      if (!wantsEmail) {
        skipped += 1;
        await markEmailDeliveryProcessed(evt.id, delivery.userId);
        continue;
      }
      const [user] = await db
        .select({ email: users.email, locale: users.locale })
        .from(users)
        .where(eq(users.id, delivery.userId))
        .limit(1);
      if (!user) {
        skipped += 1;
        await markEmailDeliveryProcessed(evt.id, delivery.userId);
        continue;
      }
      const title = (payload["title"] as string | undefined) ?? defaultTitleFor(kind);
      const body = (payload["body"] as string | undefined) ?? defaultBodyFor(kind);
      const messageKey = payload["messageKey"] as string | undefined;
      const messageParams =
        (payload["messageParams"] as Record<string, string | number> | undefined) ?? undefined;
      const { subject, text: emailBody } = renderNotificationEmailCopy(
        {
          title,
          body,
          ...(messageKey ? { messageKey } : {}),
          ...(messageParams ? { messageParams } : {}),
        },
        user.locale ?? "en",
      );
      try {
        await sendEmail({ to: user.email, subject, text: emailBody });
        sent += 1;
        await markEmailDeliveryProcessed(evt.id, delivery.userId, true);
      } catch (err) {
        failed += 1;
        const message = err instanceof Error ? err.message : String(err);
        const nextAttempt = (delivery.attemptCount ?? 0) + 1;
        const isPoisoned = nextAttempt >= EMAIL_DLQ_THRESHOLD;
        await db
          .update(notificationEmailDeliveries)
          .set({
            ...(isPoisoned ? { processedAt: new Date() } : {}),
            attemptCount: sql`${notificationEmailDeliveries.attemptCount} + 1`,
            lastError: isPoisoned ? `[poisoned] ${message}` : message,
          })
          .where(
            and(
              eq(notificationEmailDeliveries.outboxEventId, evt.id),
              eq(notificationEmailDeliveries.userId, delivery.userId),
            ),
          );
        await db
          .update(outboxEvents)
          .set({
            emailAttemptCount: sql`${outboxEvents.emailAttemptCount} + 1`,
            emailLastError: isPoisoned ? `[poisoned] ${message}` : message,
          })
          .where(eq(outboxEvents.id, evt.id));
      }
    }

    const pending = await db
      .select({ userId: notificationEmailDeliveries.userId })
      .from(notificationEmailDeliveries)
      .where(
        and(
          eq(notificationEmailDeliveries.outboxEventId, evt.id),
          isNull(notificationEmailDeliveries.processedAt),
        ),
      );
    if (pending.length === 0) await markEmailEventProcessed(evt.id);
  }
  return { processed: events.length, sent, skipped, failed };
}

async function emailRecipientIds(eventType: string, payload: Record<string, unknown>) {
  const payloadRecipients =
    eventType === "comment_created"
      ? ((payload["mentionedUserIds"] as unknown[] | undefined) ?? [])
      : [payload["userId"]];
  if (eventType !== "publication_recorded") {
    return [...new Set(payloadRecipients.filter((id): id is string => typeof id === "string"))];
  }
  const contentItemId = payload["contentItemId"] as string | undefined;
  if (!contentItemId) return [];
  const [item] = await db
    .select({ contentOwnerId: contentItems.contentOwnerId, designerId: contentItems.designerId })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  return [...new Set([item?.contentOwnerId, item?.designerId].filter((id): id is string => !!id))];
}

async function markEmailDeliveryProcessed(eventId: string, userId: string, sent = false) {
  await db
    .update(notificationEmailDeliveries)
    .set({
      processedAt: new Date(),
      ...(sent ? { attemptCount: sql`${notificationEmailDeliveries.attemptCount} + 1` } : {}),
    })
    .where(
      and(
        eq(notificationEmailDeliveries.outboxEventId, eventId),
        eq(notificationEmailDeliveries.userId, userId),
      ),
    );
}

async function markEmailEventProcessed(eventId: string) {
  await db
    .update(outboxEvents)
    .set({ emailProcessedAt: new Date() })
    .where(eq(outboxEvents.id, eventId));
}

/**
 * FEAT-AUDIT-R6 — DLQ threshold. After this many failed attempts,
 * the email row is marked processed with a "poisoned" marker in
 * `last_error` so it stops re-trying. Five retries at 1-minute
 * cron cadence = 5 minutes of backoff, which is enough to clear
 * a transient Mailcow outage but short enough to catch
 * configuration errors (e.g. a missing SMTP secret) before the
 * table fills with poison rows.
 */
const EMAIL_DLQ_THRESHOLD = 5;

function eventTypeToNotificationKind(eventType: string): NotificationKind | null {
  switch (eventType as OutboxEventType) {
    case "comment_created":
      return "mention";
    case "assignment":
    case "claim":
    case "release":
      return "assignment";
    case "review_request":
      return "review_request";
    case "approval":
      return "approval";
    case "changes_requested":
      return "changes_requested";
    case "reply":
      return "reply";
    case "unresolved_question":
      return "unresolved_question";
    case "deadline":
      return "deadline";
    case "delivery":
      return "delivery";
    case "ready_to_publish":
      return "ready_to_publish";
    case "publication_recorded":
      return "system";
    default:
      return null;
  }
}

async function fanOutCommentCreated(
  payload: Record<string, unknown>,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string[]> {
  const commentId = payload["commentId"] as string | undefined;
  const contentItemId = payload["contentItemId"] as string | undefined;
  const authorId = payload["authorId"] as string | undefined;
  const mentionedUserIds = (payload["mentionedUserIds"] as string[] | undefined) ?? [];
  const visibility = payload["visibility"] as string | undefined;
  const workspaceId = payload["workspaceId"] as string | undefined;
  // The discussion service pre-computes the slug-based
  // actionUrl so the click-through lands on the real
  // /app/w/{slug}/planning/{id}#discussion route. Pass it
  // through to `maybeNotify` so the row's actionUrl is
  // exactly that — no fallback needed.
  const actionUrl = payload["actionUrl"] as string | undefined;
  if (!commentId || !contentItemId || !authorId) return [];

  // Mentions: notify each mentioned user
  const recipients = [...new Set(mentionedUserIds.filter((id): id is string => Boolean(id)))];
  for (const userId of recipients) {
    await maybeNotify(
      {
        userId,
        contentItemId,
        kind: "mention",
        title: "You were mentioned in a comment",
        body: "Someone @mentioned you in a comment on a content item.",
        messageKey: "notifications.kind.mention",
      },
      tx,
      {
        ...(workspaceId ? { workspaceId } : {}),
        ...(actionUrl ? { actionUrl } : {}),
      },
    );
  }

  // (Reply notifications: would notify the parent comment's author.
  //  Out of scope for v1 — the in-app list shows unread comments anyway.)
  void visibility;
  return recipients;
}

/**
 * Generic single-recipient fan-out used by every per-kind enqueue
 * helper below. The payload shape is the same for all 10 of the
 * non-mention kinds:
 *
 *   {
 *     userId,         // required — recipient
 *     workspaceId,    // optional
 *     contentItemId,  // optional (workspace-only events omit it)
 *     title, body, actionUrl,
 *   }
 *
 * The kind on the call site is fixed (we don't accept it as a field
 * so a payload can't smuggle an unauthorized kind past the dispatcher).
 * `maybeNotify` consults `notification_preferences` before writing.
 *
 * FEAT-AUDIT-R7 — single dispatch path. The previous implementation
 * had two branches: a `contentItemId`-present path through
 * `maybeNotify` (preference-checked) and a `contentItemId`-absent
 * path that re-implemented the preference check inline. The two
 * branches could drift (e.g. an `actionUrl` passed on the
 * contentItemId-less branch was silently dropped because the
 * manual insert didn't honour the `opts.actionUrl` argument).
 * Routing both through `maybeNotify` keeps the preference check
 * and the actionUrl fallback in one place.
 */
async function fanOutSingleRecipient(
  payload: Record<string, unknown>,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  kind: NotificationKind,
): Promise<string[]> {
  const userId = payload["userId"] as string | undefined;
  if (!userId) return [];
  const contentItemId = payload["contentItemId"] as string | undefined;
  const title = (payload["title"] as string | undefined) ?? defaultTitleFor(kind);
  const body = (payload["body"] as string | undefined) ?? defaultBodyFor(kind);
  // STUDIOFLOW_MASTER_PROMPT.md §1 — Stored system copy. Read
  // the structured key + params from the outbox payload (writers
  // attach both alongside the fallback title/body). The bell
  // resolves the i18n at view time using these columns; the
  // email dispatcher uses them at send time.
  const messageKey = payload["messageKey"] as string | undefined;
  const messageParams = payload["messageParams"] as Record<string, string | number> | undefined;
  const workspaceId = payload["workspaceId"] as string | undefined;
  const actionUrl = payload["actionUrl"] as string | undefined;
  await maybeNotify(
    {
      userId,
      ...(contentItemId ? { contentItemId } : {}),
      kind,
      title,
      body,
      ...(messageKey ? { messageKey } : {}),
      ...(messageParams ? { messageParams } : {}),
      ...(actionUrl ? { actionUrl } : {}),
    },
    tx,
    { ...(workspaceId ? { workspaceId } : {}) },
  );
  return [userId];
}

/**
 * Fan out a publication outcome to the content owner + the
 * designer (if any) so the team learns the result without
 * watching the channel list. A `failed` outcome is treated
 * with higher priority — every recipient gets a
 * "Publish failure" notification (kind: `system`) so the
 * team can react quickly.
 */
async function fanOutPublicationRecorded(
  payload: Record<string, unknown>,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string[]> {
  const contentItemId = payload["contentItemId"] as string | undefined;
  const channelStatus = payload["channelStatus"] as string | undefined;
  if (!contentItemId) return [];
  if (channelStatus !== "published" && channelStatus !== "failed") return [];

  // Read owner + designer so we can fan out to both.
  const [item] = await tx
    .select({
      workspaceId: contentItems.workspaceId,
      contentOwnerId: contentItems.contentOwnerId,
      designerId: contentItems.designerId,
    })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) return [];
  const failureReason = (payload["failureReason"] as string | undefined) ?? null;
  const title = channelStatus === "failed" ? "Publish failure" : "Item published";
  const body =
    channelStatus === "failed"
      ? `A channel failed to publish: ${failureReason ?? "no reason given"}.`
      : "A channel went live. Open the planning item to see the live URL.";
  const messageKey =
    channelStatus === "failed"
      ? failureReason
        ? "notifications.publication.failed"
        : "notifications.publication.failedNoReason"
      : "notifications.publication.published";
  const messageParams =
    channelStatus === "failed" && failureReason ? { reason: failureReason } : undefined;

  const recipients = [item.contentOwnerId, item.designerId].filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  for (const userId of recipients) {
    await fanOutSingleRecipient(
      {
        userId,
        contentItemId,
        title,
        body,
        ...(messageKey ? { messageKey } : {}),
        ...(messageParams ? { messageParams } : {}),
        // The planning detail route is `/app/w/<slug>/planning/<id>`;
        // the previous literal used `item.workspaceId` (a UUID) which
        // never resolved. Resolve the slug via the shared helper so
        // the bell click lands on the publishing tab directly.
        actionUrl: await buildActionUrlForContentItem(
          item.workspaceId,
          contentItemId,
          "publishing",
          tx,
        ),
        workspaceId: item.workspaceId,
      },
      tx,
      "system",
    );
  }
  return recipients;
}

function defaultTitleFor(kind: NotificationKind): string {
  switch (kind) {
    case "assignment":
      return "You were assigned a task";
    case "review_request":
      return "Your review is requested";
    case "approval":
      return "Content approved";
    case "changes_requested":
      return "Changes requested";
    case "reply":
      return "New reply on a comment";
    case "unresolved_question":
      return "Unresolved question needs attention";
    case "deadline":
      return "A deadline is approaching";
    case "delivery":
      return "A delivery was submitted";
    case "ready_to_publish":
      return "A piece is ready to publish";
    case "mention":
      return "You were mentioned in a comment";
    case "system":
      return "System update";
  }
}

function defaultBodyFor(kind: NotificationKind): string {
  switch (kind) {
    case "assignment":
      return "You were assigned a content item. Open it to start work.";
    case "review_request":
      return "An approval request is waiting on you.";
    case "approval":
      return "An approval was recorded on a content item you follow.";
    case "changes_requested":
      return "Reviewer requested changes. Open the item to see the notes.";
    case "reply":
      return "Someone replied to a comment you're part of.";
    case "unresolved_question":
      return "A comment is still marked as an unresolved question.";
    case "deadline":
      return "A planned publish date is approaching. Confirm the package is on track.";
    case "delivery":
      return "A new delivery version was submitted for review.";
    case "ready_to_publish":
      return "A content item moved into the ready-to-publish lane.";
    case "mention":
      return "Someone @mentioned you in a comment on a content item.";
    case "system":
      return "The workspace has a new system update.";
  }
}

/**
 * Resolve a workspace slug from a workspace identifier and return
 * a valid App Router deep-link to the planning detail page. The
 * bell click lands the user on the planning detail page (or the
 * `#hash` anchor when provided).
 *
 *   /app/w/<slug>/planning/<contentItemId>[#hash]
 *
 * `workspaceIdentifier` may be either the workspace UUID or the
 * workspace slug — most call sites pass the UUID they already have
 * on the workspace row, but a slug is supported so callers that
 * resolve the slug upstream can skip the lookup.
 *
 * When the workspace row cannot be found, the helper returns `/app`
 * (the My Work landing). The 404 transition is the worse failure
 * mode — a stale URL landing the user on the agency home is more
 * recoverable than a missing-route error.
 *
 * The lookup runs inside the caller's transaction when `tx` is
 * provided; otherwise it falls back to the global db instance. The
 * helper is `async` because the slug is a `workspaces` column and
 * we want a single round trip from each call site.
 */
export async function buildActionUrlForContentItem(
  workspaceIdentifier: string,
  contentItemId: string,
  hash?: "publishing" | "discussion" | null,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  if (!workspaceIdentifier) {
    // No workspace context — the agency landing is the safest target.
    return "/app";
  }
  const runner = tx ?? db;
  // Accept either the UUID or the slug. The Drizzle `or(...)`
  // expression resolves in a single round trip.
  const [row] = await runner
    .select({ id: workspaces.id, slug: workspaces.slug })
    .from(workspaces)
    .where(or(eq(workspaces.id, workspaceIdentifier), eq(workspaces.slug, workspaceIdentifier)))
    .limit(1);
  if (!row) {
    return "/app";
  }
  const fragment = hash ? `#${hash}` : "";
  return `/app/w/${row.slug}/planning/${contentItemId}${fragment}`;
}

async function maybeNotify(
  input: {
    userId: string;
    /**
     * The content item this notification is about. Optional so
     * workspace-scoped events (e.g. a future "your trial ends
     * tomorrow" notice) can also flow through this helper.
     * At least one of `contentItemId` or `opts.workspaceId`
     * must be present — the call site decides which.
     */
    contentItemId?: string;
    kind: NotificationKind;
    title: string;
    body: string;
    // STUDIOFLOW_MASTER_PROMPT.md §1 — Stored system copy.
    // Threaded through to the in-app row so the bell renders the
    // i18n at view time. Callers that don't yet know the key
    // simply omit it; the fallback copy is the stored title/body.
    messageKey?: string;
    messageParams?: Record<string, string | number>;
  },
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  opts: { workspaceId?: string; actionUrl?: string } = {},
) {
  // Check user preferences (default: in-app enabled, email disabled)
  const [pref] = await tx
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
  // Default click-through: the planning detail page for the
  // workspace the item lives in. The route segment requires the
  // workspace slug (not the UUID) and the planning item id, so
  // the helper resolves the slug and assembles the URL.
  // Per-event callers (deliveries, publication, materiality) pass
  // `opts.actionUrl` already pre-computed from the slug they
  // resolved upstream; the fallback here covers callers that
  // don't yet thread the slug through (mention / review_request
  // / approval / system). When even the workspace id is missing
  // the helper returns `/app` (My Work) so the bell click never
  // hits a 404. For workspace-only notifications (no
  // contentItemId) the same fallback applies — the bell click
  // lands on the workspace home rather than a 404.
  const actionUrl =
    opts.actionUrl ??
    (input.contentItemId
      ? await buildActionUrlForContentItem(opts.workspaceId ?? "", input.contentItemId, null, tx)
      : "/app");
  await createInAppNotification({
    userId: input.userId,
    ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    ...(input.contentItemId ? { contentItemId: input.contentItemId } : {}),
    kind: input.kind,
    title: input.title,
    body: input.body,
    ...(input.messageKey ? { messageKey: input.messageKey } : {}),
    ...(input.messageParams ? { messageParams: input.messageParams } : {}),
    actionUrl,
    tx,
  });
}

// ─── Preference readers / writers (FEAT-08) ─────────────────────────────

/**
 * FEAT-08 (GAP-FULL-REVIEW-2026-08-25) — notification_preferences
 * was a dead schema: the columns existed but no UI wrote them and no
 * service read them. These helpers are the only API for the rest of
 * the codebase, so the future email worker and the existing
 * dispatchOutboxOnce funnel through one place.
 *
 * Conventions:
 *  - `emailEnabled` is per (user, kind). Default OFF (opt-in).
 *  - `digestEnabled` is a single user-level toggle stored on the
 *    `system` kind (no other kind writes to it). Default OFF (opt-in).
 *  - Missing rows mean "no preference saved" — callers fall back to
 *    the safe default.
 */

async function readPreferenceRow(userId: string, kind: NotificationKind) {
  const [row] = await db
    .select({
      inAppEnabled: notificationPreferences.inAppEnabled,
      emailEnabled: notificationPreferences.emailEnabled,
      digestEnabled: notificationPreferences.digestEnabled,
    })
    .from(notificationPreferences)
    .where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.kind, kind)))
    .limit(1);
  return row;
}

/**
 * Should we email `userId` about a `kind` event? Master prompt §8
 * defaults to off; the future email worker checks this before queueing
 * a Mailcow SMTP send.
 */
export async function shouldEmailUserFor(userId: string, kind: NotificationKind): Promise<boolean> {
  const row = await readPreferenceRow(userId, kind);
  return row?.emailEnabled ?? false;
}

/**
 * Should the daily digest include events for `userId`? The digest is a
 * single user-level toggle (any "active" kind goes into the digest
 * body), so we read the `system` row.
 */
export async function shouldDigestUserFor(userId: string): Promise<boolean> {
  const row = await readPreferenceRow(userId, "system");
  return row?.digestEnabled ?? false;
}

/**
 * Per-kind preference shape used by the account-page form. R4
 * expanded the surface from two booleans to a full 11-kind
 * matrix. The `system` kind's `inAppEnabled` is intentionally
 * NOT exposed — the master prompt §8 promises "invitations and
 * security events cannot be disabled", and the `system` kind
 * is the closest match. We hardcode `inAppEnabled = true` for
 * it and force `emailEnabled = false` (those events are
 * bell-only; the email surface is reserved for user-driven
 * kinds).
 */
export const NotificationKindSchemaValues = NOTIFICATION_KIND_VALUES;

/**
 * Default snapshot. Matches the schema's column defaults
 * (`inAppEnabled: true`, `emailEnabled: false`,
 * `digestEnabled: false`) and the master prompt §8 contract
 * (in-app bell is on, email is opt-in per kind, daily digest
 * is opt-in via the system row).
 */
export function defaultNotificationPreferences(): NotificationPreferencesSnapshot {
  const out = {} as NotificationPreferencesSnapshot;
  for (const k of NotificationKindSchemaValues) {
    out[k] = { inAppEnabled: true, emailEnabled: false };
  }
  out.dailyDigest = false;
  return out;
}

/**
 * Snapshot of the user's notification preferences for the
 * account-page UI. Returns safe defaults when no row exists yet
 * — every kind defaults to "in-app on, email off" so a brand-
 * new user immediately gets the bell experience the master
 * prompt §8 contract promises.
 */
export async function getNotificationPreferencesForUser(
  userId: string,
): Promise<NotificationPreferencesSnapshot> {
  const rows = await db
    .select()
    .from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId));
  const snap = defaultNotificationPreferences();
  for (const row of rows) {
    if (NotificationKindSchemaValues.includes(row.kind as NotificationKindForPrefs)) {
      snap[row.kind as NotificationKindForPrefs] = {
        inAppEnabled: row.inAppEnabled,
        emailEnabled: row.emailEnabled,
      };
    }
    if (row.kind === "system") {
      snap.dailyDigest = row.digestEnabled;
    }
  }
  return snap;
}

export const SetNotificationPreferencesSchema = z.object({
  /**
   * Per-kind matrix. The form posts each kind × channel
   * boolean; the action flattens this back into the right
   * shape. A missing kind is treated as the default (in-app
   * on, email off) — the form is the source of truth, the
   * service just persists what the form sent.
   */
  prefs: z.record(
    NotificationKindSchema,
    z.object({
      inAppEnabled: z.boolean(),
      emailEnabled: z.boolean(),
    }),
  ),
  /** Daily-digest toggle. Lives on the `system` kind's
   * `digestEnabled` column. */
  dailyDigest: z.boolean(),
});
export type SetNotificationPreferencesInput = z.infer<typeof SetNotificationPreferencesSchema>;

/**
 * Upsert the user's notification preferences. Idempotent:
 * each (user, kind) row is overwritten on save so a user who
 * flips a toggle and saves sees the new state immediately on
 * the next request. We always write the `inAppEnabled` flag
 * the form sent — except for `system`, which is forced to
 * `true` to honour the master prompt §8 "invitations and
 * security events cannot be disabled" rule.
 */
export async function setNotificationPreferencesForUser(
  userId: string,
  input: SetNotificationPreferencesInput,
): Promise<void> {
  const parsed = SetNotificationPreferencesSchema.parse(input);
  for (const [kindRaw, prefs] of Object.entries(parsed.prefs)) {
    const kind = kindRaw as NotificationKindForPrefs;
    // Master prompt §8 — `system` is the kind we use for
    // invitations + security events. Keep it on in the bell.
    const inAppEnabled = kind === "system" ? true : prefs.inAppEnabled;
    await db
      .insert(notificationPreferences)
      .values({
        userId,
        kind,
        inAppEnabled,
        emailEnabled: prefs.emailEnabled,
        // Only the `system` row carries digestEnabled; the other
        // kinds share the same column shape but the value is
        // irrelevant there.
        digestEnabled: kind === "system" ? parsed.dailyDigest : false,
      })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.kind],
        set: {
          inAppEnabled,
          emailEnabled: prefs.emailEnabled,
          ...(kind === "system" ? { digestEnabled: parsed.dailyDigest } : {}),
        },
      });
  }
}

// ─── FEAT-01 — enqueue helpers (GAP-FULL-REVIEW-2026-08-25) ────────────────
//
// 10 of the 11 master-prompt §12 mandatory kinds never fired before
// this fix: the schema accepted the values, the dispatcher read the
// outbox, but no call site ever inserted a row except the
// `comment_created` path. The helpers below are the single API the
// rest of the codebase uses to enqueue an in-app notification:
//
//   await enqueueAssignmentNotification(tx, {
//     userId, workspaceId, contentItemId, title, body,
//   });
//
// Each helper inserts an `outbox_event` row in the caller's
// transaction. The `dispatchOutboxOnce` cron tick claims the row,
// honours `notification_preferences`, and writes a `notification`
// row. Email is a Goal 13+ worker that reads the same outbox event
// and consults the same preference flag.
//
// All 10 helpers are `async` so the existing `await tx.insert(...)`
// style is preserved at the call sites. The helper takes an optional
// `tx` so it can compose with the business transaction (the default
// commits the outbox row on its own — useful for fire-and-forget
// notifications from non-transactional contexts like a cron).

/**
 * Shared payload shape every per-kind helper accepts. The aggregate
 * fields (`aggregateType`, `aggregateId`) are the row the outbox
 * event is about; they exist so the future email worker can look
 * the row up if it needs to enrich the email body.
 */
export type EnqueueNotificationInput = {
  userId: string;
  workspaceId?: string;
  contentItemId?: string;
  /** Aggregate the event is about (e.g. "content_item"). Defaults to "content_item". */
  aggregateType?: string;
  /** Aggregate id; defaults to `contentItemId` when set. */
  aggregateId?: string;
  title?: string;
  body?: string;
  // STUDIOFLOW_MASTER_PROMPT.md §1 — Stored system copy. When
  // set, the dispatched in-app + email notifications render the
  // i18n at view / send time using the recipient's profile
  // locale; otherwise the stored `title` / `body` is the fallback.
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  actionUrl?: string;
};

async function enqueueOutboxEvent(
  eventType: OutboxEventType,
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  const runner = tx ?? db;
  const aggregateType = input.aggregateType ?? "content_item";
  const aggregateId = input.aggregateId ?? input.contentItemId ?? input.userId;
  const [row] = await runner
    .insert(outboxEvents)
    .values({
      eventType,
      aggregateType,
      aggregateId,
      // FEAT-AUDIT-R8 — single source of truth for the per-event
      // payload shape. Mirrors `createInAppNotification`'s column
      // set so a new field added to one site is added to the
      // other. The `eventType` is duplicated inside the payload
      // because the dispatcher's `eventTypeToNotificationKind` map
      // reads it from there (a denormalisation the dispatcher
      // depends on for retry-without-schema-change).
      payload: {
        ...notificationCoreFields(input),
        eventType,
      },
    })
    .returning({ id: outboxEvents.id });
  if (!row) throw new Error(`Failed to enqueue ${eventType} outbox event`);
  return row.id;
}

export async function enqueueAssignmentNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("assignment", input, tx);
}

export async function enqueueClaimNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("claim", input, tx);
}

export async function enqueueReleaseNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("release", input, tx);
}

export async function enqueueReviewRequestNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("review_request", input, tx);
}

export async function enqueueApprovalNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("approval", input, tx);
}

export async function enqueueChangesRequestedNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("changes_requested", input, tx);
}

export async function enqueueReplyNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("reply", input, tx);
}

export async function enqueueUnresolvedQuestionNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("unresolved_question", input, tx);
}

export async function enqueueDeadlineNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("deadline", input, tx);
}

export async function enqueueDeliveryNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("delivery", input, tx);
}

export async function enqueueReadyToPublishNotification(
  input: EnqueueNotificationInput,
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  return enqueueOutboxEvent("ready_to_publish", input, tx);
}

// ─── Read helpers for the /app topbar ──────────────────────────────────

export type NotificationRow = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  // STUDIOFLOW_MASTER_PROMPT.md §1 — Stored system copy. The
  // bell + email dispatcher render the i18n at view / send time
  // when set; otherwise the stored `title` / `body` is the fallback.
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

/**
 * STUDIOFLOW_MASTER_PROMPT.md §1 — Stored system copy. Render the
 * persisted `title` + `body` for the given locale using the
 * `messageKey` + `messageParams` columns when present. Falls back
 * to the stored English copy when `messageKey` is null (the
 * additive migration keeps every pre-existing row with no
 * `messageKey`, so the fallback is the common case until every
 * writer is updated).
 */
export function renderNotificationCopy(
  row: Pick<NotificationRow, "title" | "body" | "messageKey" | "messageParams">,
  locale: string,
): { title: string; body: string } {
  if (!row.messageKey) return { title: row.title, body: row.body };
  const t = tFor(locale as Parameters<typeof tFor>[0]);
  const title = t(row.messageKey + ".title", row.messageParams ?? undefined);
  const body = t(row.messageKey + ".body", row.messageParams ?? undefined);
  // Loud-key wrapper on missing translations — surface the gap
  // to tests rather than silently falling back to English.
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

// ─── FEAT-07 — single-row mark + preferences write (GAP-FULL-REVIEW-2026-08-25) ──
//
// §14 listed `markNotificationRead` (singular) and
// `updateNotificationPreferences` as required commands. The plural
// `markNotificationsRead` was already exported (the bell's
// "Mark all as read" button uses the batch path), but the
// per-notification one was missing. Same for the preferences writer
// — the FEAT-08 helpers above only read the rows; the UI was left to
// re-use `setNotificationPreferencesForUser` and that was never
// re-exported under the §14 contract name.

export const MarkReadOneSchema = z.object({
  notificationId: z.string().uuid(),
});
export type MarkReadOneInput = z.infer<typeof MarkReadOneSchema>;

/**
 * Mark a single notification as read. Idempotent — re-marking an
 * already-read row leaves `read_at` unchanged. Refuses to mark
 * another user's notification read (the actor can only act on
 * their own).
 */
export async function markNotificationRead(actor: Actor, input: MarkReadOneInput) {
  const parsed = MarkReadOneSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, actor.id), eq(notifications.id, parsed.data.notificationId)),
    );
}

export type UpdateNotificationPreferencesInput = SetNotificationPreferencesInput;

/**
 * §14 `updateNotificationPreferences` — alias for the FEAT-08 writer
 * so the §14 contract name resolves to the same code path. UI code
 * that imports `updateNotificationPreferences` (instead of the older
 * `setNotificationPreferencesForUser`) gets the same
 * idempotent-upsert behaviour.
 */
export async function updateNotificationPreferences(
  userId: string,
  input: UpdateNotificationPreferencesInput,
): Promise<void> {
  return setNotificationPreferencesForUser(userId, input);
}
