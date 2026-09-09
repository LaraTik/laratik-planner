"use client";

import * as React from "react";
import { MessageCircle, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CommentRecord, CommentRoleFlags } from "@/components/comments/comment-item";
import { CommentItem } from "@/components/comments/comment-item";
import { CommentForm } from "@/components/comments/comment-form";
import { useLocaleT } from "@/components/i18n/locale-provider";

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
  /**
   * Bound translator from the parent (planning detail page).
   * Resolves the drawer's title, close aria-labels, the
   * "(N open)" suffix, the "N mention for you" banner, the
   * empty state, the "Add comment" CTA, the no-permission
   * state, and threads `t` to the embedded `<CommentItem>`
   * and `<CommentForm>` so the entire discussion surface
   * renders in the active locale.
   */
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
  const t = useLocaleT();
  const [replyingTo, setReplyingTo] = React.useState<string | null>(null);
  const [showForm, setShowForm] = React.useState(false);
  const headingRef = React.useRef<HTMLHeadingElement | null>(null);
  const openerRef = React.useRef<HTMLElement | null>(null);
  const wasOpenRef = React.useRef(false);

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

  React.useEffect(() => {
    if (open && !wasOpenRef.current) {
      openerRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    if (!open && wasOpenRef.current) {
      window.requestAnimationFrame(() => openerRef.current?.focus());
    }
    wasOpenRef.current = open;
  }, [open, onOpenChange]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="bg-fg-primary/40 fixed inset-0 z-40 backdrop-blur-[1px]"
          data-testid="discussion-drawer-backdrop"
        />
        <DialogPrimitive.Content
          className={cn(
            "bg-surface fixed inset-y-0 end-0 z-50 flex h-full w-full flex-col border-s shadow-xl",
            "max-w-md focus:outline-none sm:max-w-md md:max-w-lg",
          )}
          data-testid="discussion-drawer"
          aria-describedby="discussion-drawer-description"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            headingRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <header className="border-border flex items-center justify-between gap-2 border-b p-4">
            <DialogPrimitive.Title asChild>
              <h2
                id="discussion-drawer-heading"
                ref={headingRef}
                tabIndex={-1}
                className="text-title-card text-fg-primary flex items-center gap-2 font-semibold"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                {t("contentDetail.comments.drawer.title")}
                {openCount > 0 ? (
                  <span className="text-label text-fg-muted">
                    {t("contentDetail.comments.drawer.openCount", { count: openCount })}
                  </span>
                ) : null}
              </h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                variant="ghost"
                size="sm"
                aria-label={t("contentDetail.comments.drawer.closeAria")}
                data-testid="discussion-drawer-close"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </header>
          <DialogPrimitive.Description asChild>
            <p id="discussion-drawer-description" className="sr-only">
              {t("contentDetail.comments.drawer.description")}
            </p>
          </DialogPrimitive.Description>
          {mentionCount > 0 ? (
            <p className="border-border bg-primary-subtle text-label text-primary border-b px-4 py-2 font-semibold">
              {mentionCount === 1
                ? t("contentDetail.comments.drawer.mentionForYouOne")
                : t("contentDetail.comments.drawer.mentionForYouMany", { count: mentionCount })}
            </p>
          ) : null}
          <div className="flex-1 overflow-y-auto p-4">
            {comments.length === 0 ? (
              <p className="text-body text-fg-muted">{t("contentDetail.comments.drawer.empty")}</p>
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
                      t={t}
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
                        t={t}
                      />
                    ))}
                    {replyingTo === c.id ? (
                      <div className="mt-2 sm:ms-6">
                        <CommentForm
                          workspaceSlug={workspaceSlug}
                          contentItemId={contentItemId}
                          parentCommentId={c.id}
                          canPostClientVisible={canPostClientVisible}
                          canPostInternal={canPostInternal}
                          onCancel={() => setReplyingTo(null)}
                          t={t}
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
                t={t}
              />
            ) : canPostInternal || canPostClientVisible ? (
              <Button variant="secondary" size="sm" onClick={() => setShowForm(true)}>
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                {t("contentDetail.comments.drawer.addButton")}
              </Button>
            ) : (
              <p className="text-label text-fg-muted">
                {t("contentDetail.comments.drawer.noPermission")}
              </p>
            )}
          </footer>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
