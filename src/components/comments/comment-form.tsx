"use client";

import { CommentComposer, type CommentVisibility } from "@/components/comments/comment-composer";

/**
 * Backwards-compatible alias for the old `<CommentForm>` API.
 * The new `<CommentComposer>` is the canonical name; this thin
 * wrapper keeps existing imports working. The signature is
 * unchanged: workspaceSlug, contentItemId, parentCommentId
 * (optional), role flags, onCancel, onPosted.
 */
export interface CommentFormProps {
  workspaceSlug: string;
  contentItemId: string;
  parentCommentId?: string;
  canPostClientVisible: boolean;
  canPostInternal: boolean;
  /** Optional default visibility override (e.g. for replies). */
  defaultVisibility?: CommentVisibility;
  onCancel?: () => void;
  onPosted?: () => void;
  /**
   * Bound translator from the parent. Threaded through to
   * `<CommentComposer>` (and onward to `<MentionPicker>`) so
   * the composer's placeholder, visibility chips, label
   * options, submit/cancel buttons, and the mention picker's
   * headers all render in the active locale.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
}

export function CommentForm({
  workspaceSlug,
  contentItemId,
  parentCommentId,
  canPostClientVisible,
  canPostInternal,
  defaultVisibility,
  onCancel,
  onPosted,
  t,
}: CommentFormProps) {
  return (
    <CommentComposer
      workspaceSlug={workspaceSlug}
      contentItemId={contentItemId}
      {...(parentCommentId ? { parentCommentId } : {})}
      canPostClientVisible={canPostClientVisible}
      canPostInternal={canPostInternal}
      {...(defaultVisibility ? { defaultVisibility } : {})}
      {...(onCancel ? { onCancel } : {})}
      {...(onPosted ? { onPosted } : {})}
      t={t}
    />
  );
}
