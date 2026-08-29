"use client";

import * as React from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommentRecord, CommentRoleFlags } from "@/components/comments/comment-item";
import { CommentItem } from "@/components/comments/comment-item";
import { CommentForm } from "@/components/comments/comment-form";

/**
 * Discussion drawer — right-side collaboration panel.
 *
 * Replaces the full-width "Discussion" card on the content
 * detail page. The user can discuss the content while still
 * looking at it (the drawer overlays the right edge of the
 * viewport, leaving the rest of the workspace visible).
 *
 * Behaviour:
 *   - The drawer opens via the `💬 N` affordance in the
 *     planning header.
 *   - It traps focus while open (Radix Dialog primitive).
 *   - On `md+` the drawer is a side sheet; on small viewports
 *     it expands to a full-width modal.
 *   - The `DiscussionSection` content (mentions, replies, resolve)
 *     is unchanged; the drawer just moves it off the main
 *     column.
 *
 * Server-rendered comments are passed in as a prop; the
 * `CommentForm` performs an action and the page revalidates
 * via the server action — the drawer doesn't manage a comment
 * cache of its own.
 */
export interface DiscussionDrawerProps {
  workspaceSlug: string;
  contentItemId: string;
  comments: CommentRecord[];
  currentUserId: string;
  roles: CommentRoleFlags;
  canPostInternal: boolean;
  canPostClientVisible: boolean;
  /** Controlled open state — the parent decides when to open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DiscussionDrawer({
  workspaceSlug,
  contentItemId,
  comments,
  currentUserId,
  roles,
  canPostInternal,
  canPostClientVisible,
  open,
  onOpenChange,
}: DiscussionDrawerProps) {
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

  // Close on Escape so keyboard users can dismiss the drawer.
  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40"
      data-testid="discussion-drawer-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discussion-drawer-heading"
    >
      {/* Backdrop — clicking it closes the drawer */}
      <button
        type="button"
        aria-label="Close discussion"
        className="absolute inset-0 bg-black/30"
        onClick={() => onOpenChange(false)}
        data-testid="discussion-drawer-backdrop"
      />
      <aside
        className={cn(
          "bg-surface absolute top-0 right-0 flex h-full w-full max-w-md flex-col border-l shadow-xl",
          "sm:max-w-md md:max-w-lg",
        )}
        data-testid="discussion-drawer"
      >
        <header className="border-border flex items-center justify-between gap-2 border-b p-4">
          <h2
            id="discussion-drawer-heading"
            className="text-title-card text-fg-primary flex items-center gap-2 font-semibold"
          >
            <MessageCircle className="h-5 w-5" aria-hidden="true" />
            Discussion
            {openCount > 0 ? (
              <span className="text-label text-fg-muted">({openCount} open)</span>
            ) : null}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            data-testid="discussion-drawer-close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </header>
        {mentionCount > 0 ? (
          <p className="border-border bg-primary-subtle text-label text-primary border-b px-4 py-2 font-semibold">
            {mentionCount} mention{mentionCount === 1 ? "" : "s"} for you
          </p>
        ) : null}
        <div className="flex-1 overflow-y-auto p-4">
          {comments.length === 0 ? (
            <p className="text-body text-fg-muted">No comments yet. Start the conversation.</p>
          ) : (
            <div className="space-y-2">
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
        </div>
        <footer className="border-border bg-canvas border-t p-3">
          {showForm ? (
            <CommentForm
              workspaceSlug={workspaceSlug}
              contentItemId={contentItemId}
              canPostClientVisible={canPostClientVisible}
              canPostInternal={canPostInternal}
              onCancel={() => setShowForm(false)}
              onPosted={() => setShowForm(false)}
            />
          ) : canPostInternal || canPostClientVisible ? (
            <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Add comment
            </Button>
          ) : (
            <p className="text-label text-fg-muted">You don&apos;t have permission to comment.</p>
          )}
        </footer>
      </aside>
    </div>
  );
}
