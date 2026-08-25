import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, notificationPreferences, outboxEvents, users } from "@/lib/db/schema";
import { type Actor } from "@/lib/auth/policy";
import { sendEmail } from "@/lib/email";
import { z } from "zod";

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
  // Optional transaction — used by the outbox dispatcher so the
  // notification fan-out and the outbox row update commit together.
  tx?: Parameters<Parameters<typeof db.transaction>[0]>[0];
}) {
  const runner = input.tx ?? db;
  const [created] = await runner
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
void db; // `db` referenced via the `tx` parameter type only

/**
 * Process the outbox: for each unprocessed outbox_event, fan out
 * in-app notifications to the affected users. Email is a Goal 13+ job
 * (a separate worker that calls the Mailcow SMTP transport).
 *
 * Each event is processed in its own transaction so partial failures
 * don't poison the queue. The claim (SELECT) does not use SKIP LOCKED
 * today because this is a single-process worker; if/when we run >1
 * concurrent dispatchers, add `.for("update", { skipLocked: true })` to
 * the SELECT and move the `processed_at` write into the same tx.
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
      await db.transaction(async (tx) => {
        const payload = evt.payload as Record<string, unknown> | null;
        if (payload) {
          switch (evt.eventType as OutboxEventType) {
            case "comment_created":
              await fanOutCommentCreated(payload, tx);
              break;
            case "assignment":
              await fanOutSingleRecipient(payload, tx, "assignment");
              break;
            case "claim":
              await fanOutSingleRecipient(payload, tx, "assignment");
              break;
            case "release":
              await fanOutSingleRecipient(payload, tx, "assignment");
              break;
            case "review_request":
              await fanOutSingleRecipient(payload, tx, "review_request");
              break;
            case "approval":
              await fanOutSingleRecipient(payload, tx, "approval");
              break;
            case "changes_requested":
              await fanOutSingleRecipient(payload, tx, "changes_requested");
              break;
            case "reply":
              await fanOutSingleRecipient(payload, tx, "reply");
              break;
            case "unresolved_question":
              await fanOutSingleRecipient(payload, tx, "unresolved_question");
              break;
            case "deadline":
              await fanOutSingleRecipient(payload, tx, "deadline");
              break;
            case "delivery":
              await fanOutSingleRecipient(payload, tx, "delivery");
              break;
            case "ready_to_publish":
              await fanOutSingleRecipient(payload, tx, "ready_to_publish");
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
  return { processed: processed.length };
}

// ─── FEAT-10 — email dispatch (GAP-FULL-REVIEW-2026-08-25) ─────────────────
//
// The in-app dispatcher above handles the bell. This companion
// function reads the same outbox_events rows, but fans out via
// `sendEmail` (Mailcow) instead. It honours
// `notification_preferences.email_enabled` per (user, kind) and
// silently skips the row when the user hasn't opted in.
//
// Invariants:
//   - Re-reads the user + preference for every row (avoids stale
//     reads when a user toggles their preference between writes).
//   - Never deletes the outbox row on failure; bumps
//     `attempt_count` + writes `last_error` so the row can be
//     retried by the next cron tick. The outbox dispatcher + the
//     email worker share the same retry surface.
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
 * `email_enabled` flag is set for the matching kind, and updates
 * `processed_at` / `attempt_count` on every row. Returns the
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
    .where(and(isNull(outboxEvents.processedAt), sql`${outboxEvents.availableAt} <= ${now}`))
    .orderBy(outboxEvents.availableAt)
    .limit(maxEvents);

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const evt of events) {
    const payload = (evt.payload as Record<string, unknown> | null) ?? {};
    const userId = payload["userId"] as string | undefined;
    if (!userId) {
      // No recipient — count as skipped and mark processed so the
      // queue doesn't loop on the row.
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date(), attemptCount: sql`${outboxEvents.attemptCount} + 1` })
        .where(eq(outboxEvents.id, evt.id));
      skipped += 1;
      continue;
    }
    // Map the outbox eventType → the notification kind we use for
    // the preference lookup. comment_created / claim / release
    // collapse to "mention" / "assignment" respectively (the
    // schema enum has no separate claim/release kinds).
    const kind = eventTypeToNotificationKind(evt.eventType as string);
    if (!kind) {
      skipped += 1;
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date(), attemptCount: sql`${outboxEvents.attemptCount} + 1` })
        .where(eq(outboxEvents.id, evt.id));
      continue;
    }
    const wantsEmail = await shouldEmailUserFor(userId, kind);
    if (!wantsEmail) {
      skipped += 1;
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date(), attemptCount: sql`${outboxEvents.attemptCount} + 1` })
        .where(eq(outboxEvents.id, evt.id));
      continue;
    }
    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) {
      skipped += 1;
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date(), attemptCount: sql`${outboxEvents.attemptCount} + 1` })
        .where(eq(outboxEvents.id, evt.id));
      continue;
    }
    const title = (payload["title"] as string | undefined) ?? defaultTitleFor(kind);
    const body = (payload["body"] as string | undefined) ?? defaultBodyFor(kind);
    try {
      await sendEmail({ to: user.email, subject: title, text: body });
      await db
        .update(outboxEvents)
        .set({ processedAt: new Date(), attemptCount: sql`${outboxEvents.attemptCount} + 1` })
        .where(eq(outboxEvents.id, evt.id));
      sent += 1;
    } catch (err) {
      // Failure path: bump attempt_count + write last_error. The
      // row stays in the queue (processedAt is null) so the next
      // tick retries. The Mailcow transient-error rate is the
      // natural backoff (the cron runs every minute).
      await db
        .update(outboxEvents)
        .set({
          attemptCount: sql`${outboxEvents.attemptCount} + 1`,
          lastError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(outboxEvents.id, evt.id));
      failed += 1;
    }
  }
  return { processed: events.length, sent, skipped, failed };
}

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
    default:
      return null;
  }
}

async function fanOutCommentCreated(
  payload: Record<string, unknown>,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
) {
  const commentId = payload["commentId"] as string | undefined;
  const contentItemId = payload["contentItemId"] as string | undefined;
  const authorId = payload["authorId"] as string | undefined;
  const mentionedUserIds = (payload["mentionedUserIds"] as string[] | undefined) ?? [];
  const visibility = payload["visibility"] as string | undefined;
  if (!commentId || !contentItemId || !authorId) return;

  // Mentions: notify each mentioned user
  for (const userId of mentionedUserIds) {
    await maybeNotify(
      {
        userId,
        contentItemId,
        kind: "mention",
        title: "You were mentioned in a comment",
        body: "Someone @mentioned you in a comment on a content item.",
      },
      tx,
    );
    // FEAT-08: read the user's email opt-in before queuing any email
    // for this mention. The SMTP transport doesn't ship in v1, so
    // today this is a single read + no-op (the "skip" the audit asks
    // for). The future email worker calls the same helper, so when
    // Mailcow wiring lands the opt-out is already enforced here.
    if (!(await shouldEmailUserFor(userId, "mention"))) {
      continue;
    }
  }

  // (Reply notifications: would notify the parent comment's author.
  //  Out of scope for v1 — the in-app list shows unread comments anyway.)
  void visibility;
}

/**
 * Generic single-recipient fan-out used by every per-kind enqueue
 * helper below. The payload shape is the same for all 10 of the
 * non-mention kinds:
 *
 *   {
 *     userId,         // required — recipient
 *     workspaceId,    // optional
 *     contentItemId,  // optional
 *     title, body, actionUrl,
 *   }
 *
 * The kind on the call site is fixed (we don't accept it as a field
 * so a payload can't smuggle an unauthorized kind past the dispatcher).
 * `maybeNotify` consults `notification_preferences` before writing.
 */
async function fanOutSingleRecipient(
  payload: Record<string, unknown>,
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  kind: NotificationKind,
) {
  const userId = payload["userId"] as string | undefined;
  if (!userId) return;
  const contentItemId = payload["contentItemId"] as string | undefined;
  const title = (payload["title"] as string | undefined) ?? defaultTitleFor(kind);
  const body = (payload["body"] as string | undefined) ?? defaultBodyFor(kind);
  const workspaceId = payload["workspaceId"] as string | undefined;
  const actionUrl = payload["actionUrl"] as string | undefined;
  if (contentItemId) {
    await maybeNotify(
      {
        userId,
        contentItemId,
        kind,
        title,
        body,
        ...(actionUrl ? { actionUrl } : {}),
      },
      tx,
      { ...(workspaceId ? { workspaceId } : {}) },
    );
  } else {
    // Fall back to the workspace-scoped notification (no
    // contentItemId). We bypass `maybeNotify`'s actionUrl default by
    // writing the row directly.
    const [pref] = await tx
      .select({ inAppEnabled: notificationPreferences.inAppEnabled })
      .from(notificationPreferences)
      .where(
        and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.kind, kind)),
      )
      .limit(1);
    const inAppEnabled = pref?.inAppEnabled ?? true;
    if (!inAppEnabled) return;
    await createInAppNotification({
      userId,
      ...(workspaceId ? { workspaceId } : {}),
      kind,
      title,
      body,
      ...(actionUrl ? { actionUrl } : {}),
      tx,
    });
  }
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

async function maybeNotify(
  input: {
    userId: string;
    contentItemId: string;
    kind: NotificationKind;
    title: string;
    body: string;
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
  await createInAppNotification({
    userId: input.userId,
    ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    contentItemId: input.contentItemId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    actionUrl: opts.actionUrl ?? `/app/planning/${input.contentItemId}`,
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
 * Snapshot of the user's notification preferences for the account-page
 * UI. Returns safe defaults when no row exists yet.
 */
export async function getNotificationPreferencesForUser(userId: string): Promise<{
  emailOnMention: boolean;
  dailyDigest: boolean;
}> {
  const [mention, systemRow] = await Promise.all([
    readPreferenceRow(userId, "mention"),
    readPreferenceRow(userId, "system"),
  ]);
  return {
    emailOnMention: mention?.emailEnabled ?? false,
    dailyDigest: systemRow?.digestEnabled ?? false,
  };
}

export const SetNotificationPreferencesSchema = z.object({
  emailOnMention: z.boolean(),
  dailyDigest: z.boolean(),
});
export type SetNotificationPreferencesInput = z.infer<typeof SetNotificationPreferencesSchema>;

/**
 * Upsert the user's notification preferences. Idempotent: subsequent
 * saves overwrite the previous flag values for the two kinds we own.
 * We never touch `inAppEnabled` — that flag is owned by the broader
 * notification preferences writer and is always on today.
 */
export async function setNotificationPreferencesForUser(
  userId: string,
  input: SetNotificationPreferencesInput,
): Promise<void> {
  const parsed = SetNotificationPreferencesSchema.parse(input);
  await db
    .insert(notificationPreferences)
    .values({
      userId,
      kind: "mention",
      inAppEnabled: true,
      emailEnabled: parsed.emailOnMention,
      digestEnabled: false,
    })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.kind],
      set: { emailEnabled: parsed.emailOnMention },
    });
  await db
    .insert(notificationPreferences)
    .values({
      userId,
      kind: "system",
      inAppEnabled: true,
      emailEnabled: false,
      digestEnabled: parsed.dailyDigest,
    })
    .onConflictDoUpdate({
      target: [notificationPreferences.userId, notificationPreferences.kind],
      set: { digestEnabled: parsed.dailyDigest },
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
      payload: {
        userId: input.userId,
        ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
        ...(input.contentItemId ? { contentItemId: input.contentItemId } : {}),
        ...(input.title ? { title: input.title } : {}),
        ...(input.body ? { body: input.body } : {}),
        ...(input.actionUrl ? { actionUrl: input.actionUrl } : {}),
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
