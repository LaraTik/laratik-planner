import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents, contentItems, workspaces } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { reconcileContentItemMediaFolders } from "@/features/media/server";
import { z } from "zod";

export const RescheduleContentItemSchema = z.object({
  contentItemId: z.string().uuid(),
  plannedPublishAt: z.coerce.date(),
});
export type RescheduleContentItemInput = z.infer<typeof RescheduleContentItemSchema>;

export async function rescheduleContentItem(actor: Actor, input: RescheduleContentItemInput) {
  const parsed = RescheduleContentItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const [item] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      plannedPublishAt: contentItems.plannedPublishAt,
      designerId: contentItems.designerId,
      contentOwnerId: contentItems.contentOwnerId,
      title: contentItems.title,
      format: contentItems.format,
      agencyId: workspaces.agencyId,
    })
    .from(contentItems)
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "reschedule_content",
  );
  // No-op when the date didn't change.
  if (item.plannedPublishAt.getTime() === parsed.data.plannedPublishAt.getTime()) return;
  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ plannedPublishAt: parsed.data.plannedPublishAt, updatedAt: new Date() })
      .where(eq(contentItems.id, parsed.data.contentItemId));
    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: parsed.data.contentItemId,
      actorId: actor.id,
      kind: "schedule_change",
      summary: `Rescheduled "${item.title}"`,
      beforeData: { plannedPublishAt: item.plannedPublishAt.toISOString() },
      afterData: { plannedPublishAt: parsed.data.plannedPublishAt.toISOString() },
      metadata: {
        field: "date",
        before: item.plannedPublishAt.toISOString(),
        after: parsed.data.plannedPublishAt.toISOString(),
      },
    });
  });
  // FEAT-MEDIA-LIBRARY-2026-09-16 — silent folder reconcile when the
  // schedule changes (drag-to-reschedule on the board).
  try {
    await reconcileContentItemMediaFolders({
      actor,
      agencyId: item.agencyId,
      workspaceId: item.workspaceId,
      contentItemId: parsed.data.contentItemId,
      prevFormat: item.format,
      nextFormat: item.format,
      prevPlannedPublishAt: item.plannedPublishAt,
      nextPlannedPublishAt: parsed.data.plannedPublishAt,
    });
  } catch {
    // Best-effort; planner sees a non-blocking banner.
  }
}

// ─── FEAT-18 (GAP-FULL-REVIEW-2026-08-25) — deadline sweep ──────────────
//
// Master prompt §12 lists `deadline` as one of the 11 mandatory
// notification kinds. Today nothing fires it: the workflow transition
// path handles `ready_to_publish` and approval-driven events, but
// the "your publish date is tomorrow / in 3 days" reminder was never
// wired. This helper is the body of the daily cron — the cron route
// will call it once an hour, the function picks the items whose
// `planned_publish_at` is within the warning window and that have
// not been notified in the last 24h.
//
// The sweep is intentionally idempotent: the `outbox_event` row
// written by `enqueueDeadlineNotification` carries the content item
// id in the payload, so the dispatcher (or a future sweep audit)
// can dedupe a re-run. The function also re-reads the candidate set
// inside the transaction so a content item that just transitioned
// to `published` mid-tick is skipped.

/**
 * FEAT-18 (GAP-FULL-REVIEW-2026-08-25) — daily-deadline sweep.
 *
 * Scans every workspace for content items whose planned publish
 * date is within the warning window (`now` to `now + windowHours`)
 * and that are not yet in a closed status. For each candidate
 * that has not received a `deadline` notification in the last
 * 24h, enqueues one for the content owner and the designer
 * (the two roles who can act on a missed publish date).
 *
 * The default window of 24 hours matches the "24h-before-publish"
 * reminder the master prompt §12 calls out; the helper accepts
 * an override so a future cron can also fire a 72h / 1-week
 * "approaching" reminder without rewriting the body.
 *
 * Returns the count of notifications enqueued, so the cron
 * route can log a structured summary without re-querying.
 */
