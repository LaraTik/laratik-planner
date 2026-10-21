import "server-only";
import { and, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItems, outboxEvents } from "@/lib/db/schema";
import { enqueueDeadlineNotification } from "@/lib/notifications/service";

const OPEN_DEADLINE_STATUSES = [
  "draft",
  "content_review",
  "approved_for_design",
  "in_design",
  "creative_review",
  "changes_requested",
  "blocked",
] as const;

// Reserved two-part advisory key: ASCII-like "LARA" / "DLTE" identifiers.
const DEADLINE_REMINDER_LOCK_KEYS = [0x4c415241, 0x444c5445] as const;

export type DispatchDeadlineRemindersOptions = {
  now?: Date;
  windowHours?: number;
};

export type DispatchDeadlineRemindersResult = {
  scanned: number;
  enqueued: number;
  skipped: boolean;
};

/** Queue one reminder per upcoming content item and distinct owner/designer. */
export async function dispatchDeadlineReminders(
  opts: DispatchDeadlineRemindersOptions = {},
): Promise<DispatchDeadlineRemindersResult> {
  const now = opts.now ?? new Date();
  const windowHours = opts.windowHours ?? 24;
  if (!Number.isFinite(windowHours) || windowHours <= 0 || windowHours > 168) {
    throw new RangeError("windowHours must be greater than 0 and at most 168");
  }

  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
  const dedupeCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  return db.transaction(async (tx) => {
    const lockResult = await tx.execute(
      sql<{
        locked: boolean;
      }>`SELECT pg_try_advisory_xact_lock(${DEADLINE_REMINDER_LOCK_KEYS[0]}, ${DEADLINE_REMINDER_LOCK_KEYS[1]}) AS locked`,
    );
    if (!lockResult.rows[0]?.locked) return { scanned: 0, enqueued: 0, skipped: true };

    const candidates = await tx
      .select({
        id: contentItems.id,
        workspaceId: contentItems.workspaceId,
        title: contentItems.title,
        contentOwnerId: contentItems.contentOwnerId,
        designerId: contentItems.designerId,
      })
      .from(contentItems)
      .where(
        and(
          isNull(contentItems.archivedAt),
          gte(contentItems.plannedPublishAt, now),
          lt(contentItems.plannedPublishAt, windowEnd),
          inArray(contentItems.status, [...OPEN_DEADLINE_STATUSES]),
        ),
      );

    let enqueued = 0;
    for (const item of candidates) {
      const [recent] = await tx
        .select({ id: outboxEvents.id })
        .from(outboxEvents)
        .where(
          and(
            eq(outboxEvents.eventType, "deadline"),
            eq(outboxEvents.aggregateType, "content_item"),
            eq(outboxEvents.aggregateId, item.id),
            gte(outboxEvents.createdAt, dedupeCutoff),
          ),
        )
        .limit(1);
      if (recent) continue;

      // A row lock plus the open-state predicate closes the race with a
      // concurrent workflow transition before the outbox write.
      const [fresh] = await tx
        .select({ id: contentItems.id })
        .from(contentItems)
        .where(
          and(
            eq(contentItems.id, item.id),
            inArray(contentItems.status, [...OPEN_DEADLINE_STATUSES]),
            isNull(contentItems.archivedAt),
          ),
        )
        .for("update");
      if (!fresh) continue;

      const recipients = new Set(
        [item.contentOwnerId, item.designerId].filter((id): id is string => Boolean(id)),
      );
      for (const userId of recipients) {
        await enqueueDeadlineNotification(
          {
            userId,
            workspaceId: item.workspaceId,
            contentItemId: item.id,
            title: `Deadline approaching: "${item.title}"`,
            body: "The planned publish date is approaching. Confirm the package is on track.",
            messageKey: "notifications.events.deadline_warning",
            messageParams: { title: item.title },
          },
          tx,
        );
        enqueued += 1;
      }
    }

    return { scanned: candidates.length, enqueued, skipped: false };
  });
}
