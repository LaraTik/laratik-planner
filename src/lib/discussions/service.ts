import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commentMentions,
  comments,
  contentItems,
  outboxEvents,
  users,
  workspaceMemberships,
} from "@/lib/db/schema";
import { canAccessWorkspace, hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { revalidatePath } from "next/cache";
import { z } from "zod";

/**
 * Discussions service (Goal 8 — master prompt §8 + §11).
 *
 * Per master prompt:
 *  - "Client reviewers may read only client-visible comments on items
 *    available to them."
 *  - "A reply cannot be more restrictive than its parent (a reply
 *    cannot be less restrictive than an internal parent)."
 *  - Comments are flat (one level of threading only via parent_comment_id)
 *    per the schema; a "thread" is a parent + its replies.
 *  - @mentions create comment_mention rows + notifications in the same
 *    transaction (outbox pattern).
 */

export const VISIBILITY_VALUES = ["internal", "client"] as const;
export const LABEL_VALUES = ["general", "question", "feedback", "decision"] as const;
export type CommentVisibility = (typeof VISIBILITY_VALUES)[number];
export type CommentLabel = (typeof LABEL_VALUES)[number];

/**
 * Parse a comment body and extract @mentions by email or display name.
 *
 * Two-pass over (body, users) is O(body_length + users) instead of the
 * O(users × body_length) of the previous `body.includes(candidate)`
 * loop. The body is scanned once for every `@`-prefixed token, then
 * each token is checked against a per-user candidate list. Token
 * order is irrelevant because the result is a unique set of user ids;
 * the user iteration order (DB-returned) is preserved for
 * determinism so the comment_mention insert order is stable.
 *
 * The mentionableUsers query (see `createComment` below) is bounded
 * at 200 members — that cap is the primary defense against an
 * absurdly large workspace, not this loop.
 */
function extractMentions(
  body: string,
  workspaceUserIds: { id: string; email: string; displayName: string }[],
) {
  // Single-pass: extract every `@`-prefixed token from the body.
  // The pattern stops at whitespace and common punctuation so
  // `@alice,` and `@bob.` parse as `@alice` and `@bob` (the
  // original `.includes()` matched the substring too, so this is
  // a strict subset of the prior behavior).
  const tokenRegex = /@[^\s,;.!?:()[\]{}<>]+/g;
  const tokens = new Set<string>();
  for (const match of body.matchAll(tokenRegex)) {
    tokens.add(match[0]);
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const user of workspaceUserIds) {
    if (seen.has(user.id)) continue;
    const candidates = [
      `@${user.email}`,
      `@${user.email.split("@")[0]}`,
      `@${user.displayName.replace(/\s+/g, "")}`,
    ];
    for (const c of candidates) {
      if (tokens.has(c)) {
        out.push(user.id);
        seen.add(user.id);
        break;
      }
    }
  }
  return out;
}

// ─── Schemas ────────────────────────────────────────────────────────────
export const CreateCommentSchema = z.object({
  contentItemId: z.string().uuid(),
  parentCommentId: z.string().uuid().optional(),
  body: z.string().min(1).max(10_000),
  visibility: z.enum(VISIBILITY_VALUES),
  label: z.enum(LABEL_VALUES).optional(),
});
export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const ResolveCommentSchema = z.object({
  commentId: z.string().uuid(),
  resolved: z.boolean(),
});
export type ResolveCommentInput = z.infer<typeof ResolveCommentSchema>;

// ─── Create comment ────────────────────────────────────────────────────
/**
 * Create a comment. Optionally pass `structuredMentionIds` (the
 * ids the client tracked in its mention picker) to guarantee the
 * mention rows are written even if the body text doesn't contain
 * the `@displayName` token (e.g. a user was renamed after they
 * were picked, or the picker was used and the user hasn't typed
 * anything yet). The service still runs the body regex and
 * unions the two sets before inserting.
 */
export async function createComment(
  actor: Actor,
  input: CreateCommentInput,
  structuredMentionIds: string[] = [],
) {
  const parsed = CreateCommentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const data = parsed.data;

  // Resolve workspaceId via the content item
  const [item] = await db
    .select({ workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, data.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");

  // Anyone in the workspace (any role) can comment
  await requirePolicy(canAccessWorkspace(actor, item.workspaceId), "comment");

  // Reply visibility cannot be less restrictive than parent
  if (data.parentCommentId) {
    const [parent] = await db
      .select({ visibility: comments.visibility })
      .from(comments)
      .where(eq(comments.id, data.parentCommentId))
      .limit(1);
    if (!parent) throw new Error("Parent comment not found");
    if (parent.visibility === "internal" && data.visibility !== "internal") {
      throw new Error("Reply to internal comment must be internal");
    }
  }

  // Client reviewers can only post client-visible comments
  const isClientReviewerOnly = await hasWorkspaceRole(actor, item.workspaceId, ["client_reviewer"]);
  const hasInternalRole = await hasWorkspaceRole(actor, item.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "publisher",
  ]);
  if (isClientReviewerOnly && !hasInternalRole && data.visibility !== "client") {
    throw new Error("Client reviewers can only post client-visible comments");
  }

  // Resolve mentions from the body. Bounded at 200 members so a
  // 10 000-char comment × 200 users × 3 candidates = 6M
  // comparisons is the worst case (now reduced further to a single
  // body pass + 600 candidate checks via the two-pass scanner in
  // `extractMentions`).
  const mentionableUsers = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName })
    .from(users)
    .innerJoin(workspaceMemberships, eq(workspaceMemberships.userId, users.id))
    .where(
      and(
        eq(workspaceMemberships.workspaceId, item.workspaceId),
        eq(workspaceMemberships.status, "active"),
      ),
    )
    .limit(200);
  const mentionedUserIds = extractMentions(data.body, mentionableUsers).filter(
    (id) => id !== actor.id, // don't self-notify
  );
  // Merge the structured picker list. The client picker posts
  // user ids directly, so the list survives name changes and
  // body edits. We dedupe against the regex list and re-check
  // that each id is actually a workspace member (a malicious
  // client could submit any uuid; we silently drop ids that
  // aren't on the membership list).
  const regexIds = new Set(mentionedUserIds);
  const validIds = new Set(mentionableUsers.map((u) => u.id));
  for (const id of structuredMentionIds) {
    if (id === actor.id) continue;
    if (!validIds.has(id)) continue;
    if (!regexIds.has(id)) {
      mentionedUserIds.push(id);
      regexIds.add(id);
    }
  }

  // Single transaction: comment + mentions + outbox + activity
  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(comments)
      .values({
        contentItemId: data.contentItemId,
        ...(data.parentCommentId ? { parentCommentId: data.parentCommentId } : {}),
        authorId: actor.id,
        visibility: data.visibility,
        label: data.label ?? "general",
        body: data.body,
      })
      .returning({ id: comments.id, createdAt: comments.createdAt });
    if (!created) throw new Error("Failed to create comment");

    if (mentionedUserIds.length > 0) {
      await tx.insert(commentMentions).values(
        mentionedUserIds.map((mentionedUserId) => ({
          commentId: created.id,
          mentionedUserId,
        })),
      );
    }

    // Outbox event so a future worker can dispatch email + in-app
    await tx.insert(outboxEvents).values({
      eventType: "comment_created",
      aggregateType: "comment",
      aggregateId: created.id,
      payload: {
        commentId: created.id,
        contentItemId: data.contentItemId,
        authorId: actor.id,
        visibility: data.visibility,
        mentionedUserIds,
        workspaceId: item.workspaceId,
      },
    });

    return { id: created.id, createdAt: created.createdAt, mentionedUserIds };
  });

  revalidatePath(`/app/w/`);
  return result;
}

// ─── Resolve / unresolve ────────────────────────────────────────────────
export async function resolveComment(actor: Actor, input: ResolveCommentInput) {
  const parsed = ResolveCommentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { commentId, resolved } = parsed.data;

  const [row] = await db
    .select({
      commentId: comments.id,
      contentItemId: comments.contentItemId,
      authorId: comments.authorId,
      workspaceId: contentItems.workspaceId,
    })
    .from(comments)
    .innerJoin(contentItems, eq(contentItems.id, comments.contentItemId))
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!row) throw new Error("Comment not found");

  // Author or any workspace_manager / content_planner can resolve
  const isAuthor = row.authorId === actor.id;
  const isPrivileged = await hasWorkspaceRole(actor, row.workspaceId, [
    "workspace_manager",
    "content_planner",
  ]);
  if (!isAuthor && !isPrivileged) {
    throw new Error("Only the author or a manager can resolve a comment");
  }

  await db
    .update(comments)
    .set({
      resolvedAt: resolved ? new Date() : null,
      resolvedBy: resolved ? actor.id : null,
    })
    .where(eq(comments.id, commentId));

  revalidatePath(`/app/w/`);
}

// ─── Read helpers ───────────────────────────────────────────────────────
export type CommentWithMeta = {
  id: string;
  parentCommentId: string | null;
  authorId: string;
  authorName: string;
  authorDisplayName: string;
  authorImage: string | null;
  visibility: CommentVisibility;
  label: CommentLabel;
  body: string;
  resolvedAt: Date | null;
  resolvedBy: string | null;
  createdAt: Date;
  editedAt: Date | null;
  mentionedUserIds: string[];
  currentUserMentioned: boolean;
};

/**
 * List all comments for a content item, visible to the actor.
 * Returns a flat list — call site groups by parent_comment_id.
 */
export async function listCommentsForItem(
  actor: Actor,
  contentItemId: string,
): Promise<CommentWithMeta[]> {
  const [item] = await db
    .select({ workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) return [];

  await requirePolicy(canAccessWorkspace(actor, item.workspaceId), "view_comments");

  // Determine what visibility the actor can see
  const canSeeInternal = await hasWorkspaceRole(actor, item.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "publisher",
  ]);
  const visibilityFilter: CommentVisibility[] = canSeeInternal
    ? ["internal", "client"]
    : ["client"];

  const rows = await db
    .select({
      id: comments.id,
      parentCommentId: comments.parentCommentId,
      authorId: comments.authorId,
      authorName: users.name,
      authorDisplayName: users.displayName,
      authorImage: users.image,
      visibility: comments.visibility,
      label: comments.label,
      body: comments.body,
      resolvedAt: comments.resolvedAt,
      resolvedBy: comments.resolvedBy,
      createdAt: comments.createdAt,
      editedAt: comments.editedAt,
    })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.authorId))
    .where(
      and(
        eq(comments.contentItemId, contentItemId),
        inArray(comments.visibility, visibilityFilter),
      ),
    )
    .orderBy(asc(comments.createdAt));

  if (rows.length === 0) return [];

  // Mentions
  const commentIds = rows.map((r) => r.id);
  const mentions = await db
    .select({ commentId: commentMentions.commentId, userId: commentMentions.mentionedUserId })
    .from(commentMentions)
    .where(inArray(commentMentions.commentId, commentIds));

  const mentionsByComment = new Map<string, string[]>();
  for (const m of mentions) {
    const list = mentionsByComment.get(m.commentId) ?? [];
    list.push(m.userId);
    mentionsByComment.set(m.commentId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    parentCommentId: r.parentCommentId,
    authorId: r.authorId,
    authorName: r.authorName ?? "",
    authorDisplayName: r.authorDisplayName ?? r.authorName ?? "Unknown",
    authorImage: r.authorImage,
    visibility: r.visibility,
    label: r.label,
    body: r.body,
    resolvedAt: r.resolvedAt,
    resolvedBy: r.resolvedBy,
    createdAt: r.createdAt,
    editedAt: r.editedAt,
    mentionedUserIds: mentionsByComment.get(r.id) ?? [],
    currentUserMentioned: (mentionsByComment.get(r.id) ?? []).includes(actor.id),
  }));
}

// ─── Stats helper for the planning list badge ───────────────────────────
export async function countOpenCommentsForItem(
  actor: Actor,
  contentItemId: string,
): Promise<number> {
  const [item] = await db
    .select({ workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) return 0;
  const canSeeInternal = await hasWorkspaceRole(actor, item.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "publisher",
  ]);
  const visibilityFilter: CommentVisibility[] = canSeeInternal
    ? ["internal", "client"]
    : ["client"];
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(
        eq(comments.contentItemId, contentItemId),
        inArray(comments.visibility, visibilityFilter),
        isNull(comments.resolvedAt),
      ),
    );
  return row?.count ?? 0;
}
