"use client";

import * as React from "react";
import { CheckCircle, Reply } from "lucide-react";
import { resolveCommentAction } from "@/app/(app)/app/w/[slug]/planning/actions";

export type CommentAuthor = {
  id: string;
  displayName: string;
  name?: string;
  image: string | null;
};

export type CommentRecord = {
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

export type CommentRoleFlags = {
  isManager: boolean;
  isPlanner: boolean;
  isDesigner: boolean;
  isInternalReviewer: boolean;
  isClientReviewer: boolean;
  isPublisher: boolean;
};

export interface CommentItemProps {
  comment: CommentRecord;
  workspaceSlug: string;
  currentUserId: string;
  roles: CommentRoleFlags;
  onReply: () => void;
  /** When true, the item is rendered as a reply (smaller indent). */
  isReply?: boolean;
  /**
   * Bound translator from the parent (discussion drawer).
   * Resolves the visibility badge (Internal / Client), the
   * resolved status badge, the Reply / Resolve / Unresolve
   * buttons, and the mention count.
   */
  t: (key: string, params?: Record<string, string | number>) => string;
}

/**
 * CommentItem — single comment card with author, timestamp, body, and
 * the role-aware action row (Reply / Resolve / Unresolve + mention count).
 *
 * Extracted from `discussion-section.tsx` so the same render shape is
 * available to the future mobile discussion surface (Stitch screen
 * `84b2d2b8_studioflow---content-detail---discussion-mobile`) and any
 * new surface that lists comments.
 */
export function CommentItem({
  comment: c,
  workspaceSlug,
  currentUserId,
  roles,
  onReply,
  isReply = false,
  t,
}: CommentItemProps) {
  const isAuthor = c.authorId === currentUserId;
  const canResolve = isAuthor || roles.isManager || roles.isPlanner;
  return (
    <div
      className={[
        "border-border bg-surface rounded-[var(--radius-card)] border p-3",
        isReply ? "mt-2 sm:ms-6" : "",
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
              <time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString()}</time>
            </span>
            <span
              className={[
                "text-label rounded-full px-2 py-0.5",
                c.visibility === "internal"
                  ? "bg-warning-subtle text-warning"
                  : "bg-info-subtle text-info",
              ].join(" ")}
            >
              {c.visibility === "internal"
                ? t("contentDetail.comments.item.visibilityInternal")
                : t("contentDetail.comments.item.visibilityClient")}
            </span>
            {c.label !== "general" ? (
              <span className="text-label text-fg-muted rounded-full border px-2 py-0.5">
                {c.label}
              </span>
            ) : null}
            {c.resolvedAt ? (
              <span className="text-label text-success flex items-center gap-1">
                <CheckCircle className="h-3 w-3" aria-hidden="true" />{" "}
                {t("contentDetail.comments.item.resolved")}
              </span>
            ) : null}
          </div>
          <p className="text-body text-fg-primary mt-1 whitespace-pre-wrap">{c.body}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              onClick={onReply}
              className="text-label text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-1.5 py-0.5 hover:underline focus:outline-none focus-visible:ring-2"
            >
              <Reply className="me-1 inline h-3 w-3" aria-hidden="true" />{" "}
              {t("contentDetail.comments.item.reply")}
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
                  {c.resolvedAt
                    ? t("contentDetail.comments.item.unresolve")
                    : t("contentDetail.comments.item.resolve")}
                </button>
              </form>
            ) : null}
            {c.mentionedUserIds.length > 0 ? (
              <span className="text-label text-fg-muted">
                {c.mentionedUserIds.length === 1
                  ? t("contentDetail.comments.item.mentionOne")
                  : t("contentDetail.comments.item.mentionMany", {
                      count: c.mentionedUserIds.length,
                    })}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
