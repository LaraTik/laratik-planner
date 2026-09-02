"use client";

import * as React from "react";
import Link from "next/link";
import { MoreHorizontal, Edit3, Copy, UserCog, Send, Archive, ExternalLink } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/content/status";
import { useLocaleT } from "@/components/i18n/locale-provider";

/**
 * PlanningListActions — three-dot quick actions menu for a
 * planning-list row. Per Goal 33 #13: the primary interaction is
 * clicking the row title (which navigates to the detail page);
 * secondary actions live in this menu and are permission-gated.
 *
 * Rendered as a client component (DropdownMenu needs Radix) but
 * receives ZERO function props from the server. The page reads the
 * current user's role set and passes a `can*` boolean per action;
 * the menu only shows the actions the user can actually do.
 *
 * No `onClick` on the rendered DOM — every action is a `<Link>` or
 * a Radix-managed dropdown item with an `href`. Server-action
 * triggers (Duplicate, Move) are not yet wired (per the spec:
 * "Move/reschedule" needs a date picker UI; that ships in a follow-up).
 * The actions that ARE wired are real <Link>s so the row's RSC
 * safety is preserved.
 */
export interface PlanningListActionsProps {
  workspaceSlug: string;
  itemId: string;
  itemTitle: string;
  status: ContentStatus;
  /** Permission flags derived server-side from the actor's role set. */
  canEdit: boolean;
  canSubmit: boolean;
  canArchive: boolean;
  /** Tailwind class additions. */
  className?: string;
  /**
   * Optional translator. When provided, every action label and
   * the trigger's aria-label render from the `common.rowAction*`
   * catalog; when omitted, the stored English copy is used.
   */
  t?: (key: string, params?: Record<string, string | number>) => string;
}

export function PlanningListActions({
  workspaceSlug,
  itemId,
  itemTitle,
  status,
  canEdit,
  canSubmit,
  canArchive,
  className,
}: PlanningListActionsProps) {
  const t = useLocaleT();
  const tr = (key: string, fallback: string, params?: Record<string, string | number>) =>
    t(key, params) === key ? fallback : t(key, params);
  const detailHref = `/app/w/${workspaceSlug}/planning/${itemId}`;
  const isDraft = status === "draft";
  const isChangesRequested = status === "changes_requested";
  const isSubmittable = isDraft || isChangesRequested;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={tr("common.rowActionsAria", `Actions for ${itemTitle}`, { title: itemTitle })}
          data-testid="row-actions-trigger"
          className={cn(
            "border-border bg-surface text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring inline-flex h-11 w-11 items-center justify-center rounded-[var(--radius-control)] border transition-colors focus:outline-none focus-visible:ring-2",
            className,
          )}
        >
          <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{itemTitle}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={detailHref} data-testid="row-action-open">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {tr("common.rowActionOpen", "Open")}
          </Link>
        </DropdownMenuItem>
        {canEdit ? (
          <DropdownMenuItem asChild>
            <Link
              href={`/app/w/${workspaceSlug}/planning/edit/${itemId}`}
              data-testid="row-action-edit"
            >
              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
              {tr("common.rowActionEdit", "Edit")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled data-testid="row-action-duplicate">
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {tr("common.rowActionDuplicate", "Duplicate")}
          <span className="text-label text-fg-muted ms-auto text-[10px]">
            {tr("common.rowActionSoon", "soon")}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled data-testid="row-action-change-owner">
          <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
          {tr("common.rowActionChangeOwner", "Change owner")}
          <span className="text-label text-fg-muted ms-auto text-[10px]">
            {tr("common.rowActionSoon", "soon")}
          </span>
        </DropdownMenuItem>
        {canSubmit && isSubmittable ? (
          <DropdownMenuItem asChild>
            <Link
              href={`${detailHref}#workflow`}
              data-testid="row-action-submit"
              data-action="submit-for-review"
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              {isChangesRequested
                ? tr("common.rowActionResubmit", "Resubmit for review")
                : tr("common.rowActionSubmit", "Submit for review")}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {canArchive ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled data-testid="row-action-archive">
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              {tr("common.rowActionArchive", "Archive")}
              <span className="text-label text-fg-muted ms-auto text-[10px]">
                {tr("common.rowActionSoon", "soon")}
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
