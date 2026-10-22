import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import {
  agencies,
  notifications,
  notificationPreferences,
  outboxEvents,
  contentItems,
  workspaces,
} from "@/lib/db/schema";
import { workspaceBasePath } from "@/lib/urls";
import { notificationsUserTag } from "@/lib/notifications/cache";
import type { NotificationKind } from "@/lib/notifications/types";
import { defaultBodyFor, defaultTitleFor } from "@/lib/notifications/copy";
export { dispatchEmailOnce } from "@/lib/notifications/email-dispatch";
import { shouldEmailUserFor } from "@/lib/notifications/preferences";

export {
  defaultNotificationPreferences,
  getNotificationPreferencesForUser,
  NotificationKindSchema,
  NotificationKindSchemaValues,
  SetNotificationPreferencesSchema,
  setNotificationPreferencesForUser,
  shouldDigestUserFor,
  updateNotificationPreferences,
} from "@/lib/notifications/preferences";
export { shouldEmailUserFor };
export type {
  SetNotificationPreferencesInput,
  UpdateNotificationPreferencesInput,
} from "@/lib/notifications/preferences";

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

function notificationCoreFields(input: NotificationCore): NotificationCore {
  const out: NotificationCore = { userId: input.userId };
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
  const maxEvents = opts.maxEvents ?? 50;
  // Use the database clock for normal worker runs because `available_at`
  // defaults to PostgreSQL `now()`. This avoids a small host/database clock
  // skew making a just-created event invisible until the next tick. Tests
  // and callers that need a deterministic cutoff can still inject `now`.
  const availabilityCutoff = opts.now ? sql`${opts.now}` : sql`now()`;

  // Claim a batch of unprocessed events
  const events = await db
    .select()
    .from(outboxEvents)
    .where(
      and(
        isNull(outboxEvents.processedAt),
        sql`${outboxEvents.availableAt} <= ${availabilityCutoff}`,
      ),
    )
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
      const recipients = await db.transaction(async (tx) => {
        // The candidate read above is intentionally lock-free. Multiple cron
        // invocations can see the same pending rows, so acquire ownership
        // inside the transaction and re-check eligibility before fan-out.
        // SKIP LOCKED lets another worker take the next row instead of
        // waiting, while the processed_at predicate prevents a second worker
        // from replaying a row after the first commits.
        const [claimed] = await tx
          .select()
          .from(outboxEvents)
          .where(
            and(
              eq(outboxEvents.id, evt.id),
              isNull(outboxEvents.processedAt),
              sql`${outboxEvents.availableAt} <= ${availabilityCutoff}`,
            ),
          )
          .for("update", { skipLocked: true })
          .limit(1);
        if (!claimed) return null;

        const payload = claimed.payload as Record<string, unknown> | null;
        let recipients: string[] = [];
        if (payload) {
          switch (claimed.eventType as OutboxEventType) {
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
        }
        // Mark the event processed (or no-op for unknown types — see
        // above). A failure inside the fan-out throws and rolls this
        // update back so the next tick can retry.
        await tx
          .update(outboxEvents)
          .set({ processedAt: new Date(), attemptCount: sql`${outboxEvents.attemptCount} + 1` })
          .where(eq(outboxEvents.id, claimed.id));
        return recipients;
      });
      if (recipients === null) continue;
      for (const userId of recipients) recipientIds.add(userId);
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
  if (!contentItemId && workspaceId) {
    const workspaceOnlyUserId = payload["userId"] as string | undefined;
    if (!workspaceOnlyUserId) return [];
    await maybeNotify(
      {
        userId: workspaceOnlyUserId,
        kind: "mention",
        title: (payload["title"] as string | undefined) ?? defaultTitleFor("mention"),
        body: (payload["body"] as string | undefined) ?? defaultBodyFor("mention"),
        ...(payload["messageKey"] ? { messageKey: payload["messageKey"] as string } : {}),
        ...(payload["messageParams"]
          ? { messageParams: payload["messageParams"] as Record<string, string | number> }
          : {}),
      },
      tx,
      { workspaceId, ...(actionUrl ? { actionUrl } : {}) },
    );
    return [workspaceOnlyUserId];
  }
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
 * had a separate `contentItemId`-absent branch that re-implemented
 * preference handling and hard-coded the notification kind to
 * `mention`. Routing workspace-only events through the same
 * `maybeNotify` call preserves the actual event kind, preference,
 * copy, and actionUrl semantics in one place.
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
    {
      ...(workspaceId ? { workspaceId } : {}),
      ...(actionUrl ? { actionUrl } : {}),
    },
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

/**
 * Resolve a workspace slug from a workspace identifier and return
 * a valid App Router deep-link to the planning detail page. The
 * bell click lands the user on the planning detail page (or the
 * `#hash` anchor when provided).
 *
 *   /app/a/<agencySlug>/w/<slug>/planning/<contentItemId>[#hash]
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
  // A UUID column cannot safely be compared with an arbitrary slug in the
  // same SQL predicate: PostgreSQL attempts to cast the slug to uuid before
  // evaluating the OR. Branch first so both accepted identifiers remain safe.
  const workspaceWhere = isUuid(workspaceIdentifier)
    ? eq(workspaces.id, workspaceIdentifier)
    : eq(workspaces.slug, workspaceIdentifier);
  // Join the owning agency so the URL can carry the agency segment. The
  // canonical `/app/a/<agencySlug>/w/<slug>` shape is the only one that is
  // self-describing: a workspace slug is unique per agency, not globally, so
  // the legacy `/app/w/<slug>` form meant "whichever agency the reader
  // currently has active" — the cross-tenant ambiguity documented in
  // `src/lib/urls.ts`. This is a join, not an extra round-trip, which matters
  // because some callers run inside a transaction.
  const [row] = await runner
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      agencySlug: agencies.slug,
    })
    .from(workspaces)
    .innerJoin(agencies, eq(agencies.id, workspaces.agencyId))
    .where(workspaceWhere)
    .limit(1);
  if (!row) {
    return "/app";
  }
  const fragment = hash ? `#${hash}` : "";
  return `${workspaceBasePath(row.agencySlug, row.slug)}/planning/${contentItemId}${fragment}`;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
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

export {
  countUnreadNotifications,
  listNotificationsForUser,
  markAllNotificationsRead,
  markNotificationRead,
  MarkReadOneSchema,
  MarkReadSchema,
  markNotificationsRead,
  renderNotificationCopy,
} from "@/lib/notifications/inbox";
export type { MarkReadInput, MarkReadOneInput, NotificationRow } from "@/lib/notifications/inbox";
