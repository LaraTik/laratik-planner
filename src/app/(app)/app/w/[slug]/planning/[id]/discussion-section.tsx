"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";
import { CommentForm } from "@/components/comments/comment-form";
import {
  CommentItem,
  type CommentRecord,
  type CommentRoleFlags,
} from "@/components/comments/comment-item";

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
  comments: CommentRecord[];
  currentUserId: string;
  roles: CommentRoleFlags;
  canPostInternal: boolean;
  canPostClientVisible: boolean;
}) {
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);

  // Group by parent
  const topLevel = comments.filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<string, CommentRecord[]>();
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
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
                comment={c}
                workspaceSlug={workspaceSlug}
                currentUserId={currentUserId}
                roles={roles}
                onReply={() => setReplyingTo(replyingTo === c.id ? null : c.id)}
                isReply={false}
              />
              {repliesByParent.get(c.id)?.map((reply) => (
                <CommentItem
                  key={reply.id}
                  comment={reply}
                  workspaceSlug={workspaceSlug}
                  currentUserId={currentUserId}
                  roles={roles}
                  onReply={() => setReplyingTo(replyingTo === reply.id ? null : reply.id)}
                  isReply
                />
              ))}
              {replyingTo === c.id ? (
                <div className="mt-2 sm:ml-6">
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
            onPosted={() => setShowForm(false)}
          />
        </div>
      ) : canPostInternal || canPostClientVisible ? (
        <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Add comment
        </Button>
      ) : null}
    </section>
  );
}
