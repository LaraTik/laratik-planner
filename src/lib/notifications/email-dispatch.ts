import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItems, notificationEmailDeliveries, outboxEvents, users } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";
import { renderNotificationEmailCopy } from "@/lib/notifications/email-copy";
import { shouldEmailUserFor } from "@/lib/notifications/preferences";
import type { NotificationKind } from "@/lib/notifications/types";
import { defaultBodyFor, defaultTitleFor } from "@/lib/notifications/copy";
import { logError } from "@/lib/observability/logger";

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

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const evt of events) {
    try {
      const result = await db.transaction(async (tx) => {
        // Candidate discovery above is lock-free. Claim the event inside the
        // transaction so overlapping cron ticks cannot both send the same
        // recipient email. Keep the event lock until delivery state commits.
        const [claimed] = await tx
          .select()
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.id, evt.id),
              isNull(outboxEvents.emailProcessedAt),
              sql`${outboxEvents.availableAt} <= ${now}`,
            ),
          )
          .for("update", { skipLocked: true })
          .limit(1);
        if (!claimed) return null;

        const payload = (claimed.payload as Record<string, unknown> | null) ?? {};
        const kind = eventTypeToNotificationKind(claimed.eventType as string);
        const recipients = await emailRecipientIds(claimed.eventType as string, payload);
        if (!kind || recipients.length === 0) {
          await tx
            .update(outboxEvents)
            .set({ emailProcessedAt: new Date() })
            .where(eq(outboxEvents.id, claimed.id));
          return { sent: 0, skipped: recipients.length === 0 ? 1 : recipients.length, failed: 0 };
        }

        await tx
          .insert(notificationEmailDeliveries)
          .values(recipients.map((userId) => ({ outboxEventId: claimed.id, userId })))
          .onConflictDoNothing();
        const deliveries = await tx
          .select()
          .from(notificationEmailDeliveries)
          .where(
            and(
              eq(notificationEmailDeliveries.outboxEventId, claimed.id),
              isNull(notificationEmailDeliveries.processedAt),
            ),
          );

        let eventSent = 0;
        let eventSkipped = 0;
        let eventFailed = 0;
        for (const delivery of deliveries) {
          const wantsEmail = await shouldEmailUserFor(delivery.userId, kind);
          if (!wantsEmail) {
            eventSkipped += 1;
            await tx
              .update(notificationEmailDeliveries)
              .set({ processedAt: new Date() })
              .where(
                and(
                  eq(notificationEmailDeliveries.outboxEventId, claimed.id),
                  eq(notificationEmailDeliveries.userId, delivery.userId),
                ),
              );
            continue;
          }
          const [user] = await tx
            .select({ email: users.email, locale: users.locale })
            .from(users)
            .where(eq(users.id, delivery.userId))
            .limit(1);
          if (!user) {
            eventSkipped += 1;
            await tx
              .update(notificationEmailDeliveries)
              .set({ processedAt: new Date() })
              .where(
                and(
                  eq(notificationEmailDeliveries.outboxEventId, claimed.id),
                  eq(notificationEmailDeliveries.userId, delivery.userId),
                ),
              );
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
            const deliveryResult = await sendEmail({ to: user.email, subject, text: emailBody });
            if (!deliveryResult) throw new Error("SMTP is not configured");
            eventSent += 1;
            await tx
              .update(notificationEmailDeliveries)
              .set({
                processedAt: new Date(),
                attemptCount: sql`${notificationEmailDeliveries.attemptCount} + 1`,
              })
              .where(
                and(
                  eq(notificationEmailDeliveries.outboxEventId, claimed.id),
                  eq(notificationEmailDeliveries.userId, delivery.userId),
                ),
              );
          } catch (err) {
            eventFailed += 1;
            logError("notification.email_delivery_failed", {
              err,
              outboxEventId: claimed.id,
              userId: delivery.userId,
            });
            const nextAttempt = (delivery.attemptCount ?? 0) + 1;
            const isPoisoned = nextAttempt >= EMAIL_DLQ_THRESHOLD;
            const failureCode = isPoisoned
              ? "[poisoned] email_delivery_failed"
              : "email_delivery_failed";
            await tx
              .update(notificationEmailDeliveries)
              .set({
                ...(isPoisoned ? { processedAt: new Date() } : {}),
                attemptCount: sql`${notificationEmailDeliveries.attemptCount} + 1`,
                lastError: failureCode,
              })
              .where(
                and(
                  eq(notificationEmailDeliveries.outboxEventId, claimed.id),
                  eq(notificationEmailDeliveries.userId, delivery.userId),
                ),
              );
            await tx
              .update(outboxEvents)
              .set({
                emailAttemptCount: sql`${outboxEvents.emailAttemptCount} + 1`,
                emailLastError: failureCode,
              })
              .where(eq(outboxEvents.id, claimed.id));
          }
        }

        const pending = await tx
          .select({ userId: notificationEmailDeliveries.userId })
          .from(notificationEmailDeliveries)
          .where(
            and(
              eq(notificationEmailDeliveries.outboxEventId, claimed.id),
              isNull(notificationEmailDeliveries.processedAt),
            ),
          );
        if (pending.length === 0) {
          await tx
            .update(outboxEvents)
            .set({ emailProcessedAt: new Date() })
            .where(eq(outboxEvents.id, claimed.id));
        }
        return { sent: eventSent, skipped: eventSkipped, failed: eventFailed };
      });
      if (result === null) continue;
      processed += 1;
      sent += result.sent;
      skipped += result.skipped;
      failed += result.failed;
    } catch (err) {
      logError("notification.email_dispatch_failed", { err, outboxEventId: evt.id });
      await db
        .update(outboxEvents)
        .set({
          emailAttemptCount: sql`${outboxEvents.emailAttemptCount} + 1`,
          emailLastError: "email_dispatch_failed",
        })
        .where(eq(outboxEvents.id, evt.id));
    }
  }
  return { processed, sent, skipped, failed };
}

async function emailRecipientIds(eventType: string, payload: Record<string, unknown>) {
  const mentionRecipients = Array.isArray(payload["mentionedUserIds"])
    ? payload["mentionedUserIds"]
    : [];
  const payloadRecipients =
    eventType === "comment_created" && mentionRecipients.length > 0
      ? mentionRecipients
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
  switch (eventType) {
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
