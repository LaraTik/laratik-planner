"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { createCommentAction, resolveCommentAction } from "../actions";
import { CheckCircle, MessageCircle, Reply, X } from "lucide-react";

type Comment = {
  id: string;
  parentCommentId: string | null;
  authorId: string;
  authorDisplayName: string;
  authorName: string;
  authorImage: string | null;
  visibility: "internal" | "client";
  label: string;
  body: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
  editedAt: string | null;
  mentionedUserIds: string[];
  currentUserMentioned: boolean;
};

type RoleFlags = {
  isManager: boolean;
  isPlanner: boolean;
  isDesigner: boolean;
  isInternalReviewer: boolean;
  isClientReviewer: boolean;
  isPublisher: boolean;
};

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Posting…" : label}
    </Button>
  );
}

function CommentForm({
  workspaceSlug,
  contentItemId,
  parentCommentId,
  canPostClientVisible,
  canPostInternal,
  onCancel,
}: {
  workspaceSlug: string;
  contentItemId: string;
  parentCommentId?: string;
  canPostClientVisible: boolean;
  canPostInternal: boolean;
  onCancel?: () => void;
}) {
  const boundAction = createCommentAction.bind(null, workspaceSlug);
  const [state, formAction] = useFormState(boundAction, null);

  // Default visibility: client-visible if user can post both, internal if
  // they only have internal roles. Otherwise the first allowed value.
  const defaultVisibility: "internal" | "client" = canPostClientVisible ? "internal" : "client";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="contentItemId" value={contentItemId} />
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}
      <textarea
        name="body"
        required
        minLength={1}
        maxLength={10_000}
        rows={3}
        placeholder={parentCommentId ? "Write a reply…" : "Add a comment. Use @name to mention."}
        className="border-border bg-surface text-fg-primary text-body w-full rounded-[var(--radius-control)] border px-3 py-2"
      />
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-label text-fg-secondary flex items-center gap-2">
          Visibility:
          <select
            name="visibility"
            defaultValue={defaultVisibility}
            className="border-border bg-surface text-fg-primary rounded-[var(--radius-control)] border px-2 py-1 text-sm"
          >
            {canPostInternal ? <option value="internal">Internal only</option> : null}
            {canPostClientVisible ? <option value="client">Client visible</option> : null}
          </select>
        </label>
        <label className="text-label text-fg-secondary flex items-center gap-2">
          Label:
          <select
            name="label"
            defaultValue="general"
            className="border-border bg-surface text-fg-primary rounded-[var(--radius-control)] border px-2 py-1 text-sm"
          >
            <option value="general">General</option>
            <option value="question">Question</option>
            <option value="feedback">Feedback</option>
            <option value="decision">Decision</option>
          </select>
        </label>
        <div className="ml-auto flex items-center gap-2">
          {onCancel ? (
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <SubmitButton label={parentCommentId ? "Reply" : "Comment"} />
        </div>
      </div>
      {state ? (
        <p role="alert" className="text-body text-danger">
          {String((state as { error?: string }).error ?? "")}
        </p>
      ) : null}
    </form>
  );
}

function CommentItem({
  c,
  workspaceSlug,
  currentUserId,
  roles,
  onReply,
  isReply,
}: {
  c: Comment;
  workspaceSlug: string;
  currentUserId: string;
  roles: RoleFlags;
  onReply: () => void;
  isReply: boolean;
}) {
  const isAuthor = c.authorId === currentUserId;
  const canResolve = isAuthor || roles.isManager || roles.isPlanner;
  return (
    <div
      className={[
        "border-border bg-surface rounded-[var(--radius-card)] border p-3",
        isReply ? "mt-2 ml-6" : "",
        c.resolvedAt ? "opacity-60" : "",
        c.currentUserMentioned ? "border-primary/40 bg-primary-subtle/30" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="bg-primary-subtle text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
          {c.authorDisplayName.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-body text-fg-primary font-semibold">{c.authorDisplayName}</span>
            <span className="text-label text-fg-muted">
              {new Date(c.createdAt).toLocaleString()}
            </span>
            <span
              className={[
                "text-label rounded-full px-2 py-0.5",
                c.visibility === "internal"
                  ? "bg-warning-subtle text-warning"
                  : "bg-info-subtle text-info",
              ].join(" ")}
            >
              {c.visibility}
            </span>
            {c.label !== "general" ? (
              <span className="text-label text-fg-muted rounded-full border px-2 py-0.5">
                {c.label}
              </span>
            ) : null}
            {c.resolvedAt ? (
              <span className="text-label text-success flex items-center gap-1">
                <CheckCircle className="h-3 w-3" aria-hidden="true" /> resolved
              </span>
            ) : null}
          </div>
          <p className="text-body text-fg-primary mt-1 whitespace-pre-wrap">{c.body}</p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onReply}
              className="text-label text-primary hover:underline focus:outline-none focus-visible:underline"
            >
              <Reply className="mr-1 inline h-3 w-3" aria-hidden="true" /> Reply
            </button>
            {canResolve ? (
              <form
                action={resolveCommentAction.bind(null, {
                  workspaceSlug,
                  commentId: c.id,
                  resolved: !c.resolvedAt,
                })}
              >
                <button
                  type="submit"
                  className="text-label text-fg-secondary hover:text-fg-primary focus-visible:text-fg-primary focus:outline-none"
                >
                  {c.resolvedAt ? "Unresolve" : "Resolve"}
                </button>
              </form>
            ) : null}
            {c.mentionedUserIds.length > 0 ? (
              <span className="text-label text-fg-muted">
                {c.mentionedUserIds.length} mention{c.mentionedUserIds.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DiscussionSection({
  workspaceSlug,
  contentItemId,
  comments,
  currentUserId,
  roles,
  canPostInternal,
  canPostClientVisible,
}: {
  workspaceSlug: string;
  contentItemId: string;
  comments: Comment[];
  currentUserId: string;
  roles: RoleFlags;
  canPostInternal: boolean;
  canPostClientVisible: boolean;
}) {
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  // Group by parent
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, Comment[]>();
  for (const c of comments) {
    if (c.parentCommentId) {
      const list = repliesByParent.get(c.parentCommentId) ?? [];
      list.push(c);
      repliesByParent.set(c.parentCommentId, list);
    }
  }

  const openCount = comments.filter((c) => !c.resolvedAt).length;
  const mentionCount = comments.filter((c) => c.currentUserMentioned && !c.resolvedAt).length;

  return (
    <section
      aria-labelledby="discussion-heading"
      className="border-border bg-surface rounded-[var(--radius-card)] border p-5"
    >
      <header className="mb-3 flex items-center justify-between">
        <h2
          id="discussion-heading"
          className="text-title-card text-fg-primary flex items-center gap-2 font-semibold"
        >
          <MessageCircle className="h-5 w-5" aria-hidden="true" />
          Discussion
          {openCount > 0 ? (
            <span className="text-label text-fg-muted">({openCount} open)</span>
          ) : null}
        </h2>
        {mentionCount > 0 ? (
          <span className="text-label text-primary font-semibold">
            {mentionCount} mention{mentionCount === 1 ? "" : "s"} for you
          </span>
        ) : null}
      </header>

      {comments.length === 0 ? (
        <p className="text-body text-fg-muted mb-3">No comments yet. Start the conversation.</p>
      ) : (
        <div className="mb-4 space-y-2">
          {topLevel.map((c) => (
            <React.Fragment key={c.id}>
              <CommentItem
                c={c}
                workspaceSlug={workspaceSlug}
                currentUserId={currentUserId}
                roles={roles}
                onReply={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                isReply={false}
              />
              {repliesByParent.get(c.id)?.map((reply) => (
                <CommentItem
                  key={reply.id}
                  c={reply}
                  workspaceSlug={workspaceSlug}
                  currentUserId={currentUserId}
                  roles={roles}
                  onReply={() => setReplyingTo(replyingTo === reply.id ? null : reply.id)}
                  isReply
                />
              ))}
              {replyingTo === c.id ? (
                <div className="mt-2 ml-6">
                  <CommentForm
                    workspaceSlug={workspaceSlug}
                    contentItemId={contentItemId}
                    parentCommentId={c.id}
                    canPostClientVisible={canPostClientVisible}
                    canPostInternal={canPostInternal}
                    onCancel={() => setReplyingTo(null)}
                  />
                </div>
              ) : null}
            </React.Fragment>
          ))}
        </div>
      )}

      {showForm ? (
        <div className="border-border bg-canvas rounded-[var(--radius-card)] border p-3">
          <CommentForm
            workspaceSlug={workspaceSlug}
            contentItemId={contentItemId}
            canPostClientVisible={canPostClientVisible}
            canPostInternal={canPostInternal}
            onCancel={() => setShowForm(false)}
          />
        </div>
      ) : canPostInternal || canPostClientVisible ? (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Add comment
        </Button>
      ) : null}
      <span className="sr-only" role="status">
        {replyingTo ? "Reply form open" : "No reply form open"}
        <X aria-hidden="true" className="hidden" />
      </span>
    </section>
  );
}
