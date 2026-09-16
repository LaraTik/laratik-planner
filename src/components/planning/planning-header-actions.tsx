"use client";

import * as React from "react";
import Link from "next/link";
import { Calendar, MoreVertical, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useLocaleT } from "@/components/i18n/locale-provider";
import { InlineDateEditor } from "@/app/(app)/app/w/[slug]/planning/[id]/inline-editable-fields";

/**
 * PlanningHeaderActions — kebab (3-dot) menu on the right side of the
 * planning detail header.
 *
 * UI/UX Pro Max discipline:
 *   - Kebab IS the secondary-action surface (no "Open" column, no
 *     "Edit" link scattered next to the title).
 *   - Capability-aware: destructive items (Trash, Cancel) are hidden
 *     for read-only reviewers, not greyed out.
 *   - The first item — "Reschedule publish date" — opens the existing
 *     `InlineDateEditor` inline, so the user never has to navigate
 *     away from the page just to change the date.
 *
 * Phase 8 of the planning-detail refactor (2026-09-16, /ui-ux-pro-max):
 * users reported the publish-date edit affordance was missing from
 * the page chrome. The previous Overview-tab DetailsSection still
 * works for inline editing; this header kebab surfaces the most
 * common edit (reschedule) at the top of the page so it's
 * discoverable without scrolling.
 */
export function PlanningHeaderActions({
  workspaceSlug,
  contentItemId,
  canEdit,
  canTrash,
  editHref,
  plannedPublishAtIso,
  workspaceTimezone,
  status,
}: {
  workspaceSlug: string;
  contentItemId: string;
  canEdit: boolean;
  canTrash: boolean;
  editHref: string;
  plannedPublishAtIso: string;
  workspaceTimezone: string;
  status: string;
}) {
  const t = useLocaleT();
  const [rescheduleOpen, setRescheduleOpen] = React.useState(false);

  if (!canEdit && !canTrash) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {canEdit ? (
        <DropdownMenu open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t("contentDetail.overview.kebab.label")}
              data-testid="planning-header-kebab"
            >
              <MoreVertical className="h-4 w-4" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-label text-fg-muted font-semibold tracking-wide uppercase">
              {t("contentDetail.overview.kebab.label")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <button
                type="button"
                className="text-body flex w-full cursor-pointer items-center gap-2"
                data-testid="planning-kebab-reschedule"
                onSelect={(event) => {
                  // Don't close the menu on select; we render the date
                  // editor inline in the menu body (see below). The
                  // editor's "Save" / "Cancel" buttons close it.
                  event.preventDefault();
                }}
              >
                <Calendar className="text-fg-muted h-4 w-4" aria-hidden="true" />
                <span>{t("contentDetail.overview.kebab.reschedule")}</span>
              </button>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={editHref}
                className="text-body text-fg-primary flex cursor-pointer items-center gap-2"
              >
                <Pencil className="text-fg-muted h-4 w-4" aria-hidden="true" />
                <span>{t("contentDetail.overview.kebab.editDetails")}</span>
              </Link>
            </DropdownMenuItem>
            {canTrash ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-danger focus:text-danger flex cursor-pointer items-center gap-2"
                  data-testid="planning-kebab-trash"
                  onSelect={() => {
                    // Trash action lives in the workflow rail; this
                    // menu item exists so the affordance is
                    // discoverable. We don't dispatch the action
                    // here to keep the kebab self-contained; the
                    // workflow rail's trash button is the canonical
                    // path and the two stay in sync via the action
                    // module.
                  }}
                  disabled
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  <span>{t("contentDetail.overview.kebab.trash")}</span>
                </DropdownMenuItem>
              </>
            ) : null}
            {rescheduleOpen ? (
              <div className="border-border bg-surface border-t p-3">
                <InlineDateEditor
                  workspaceSlug={workspaceSlug}
                  contentItemId={contentItemId}
                  value={plannedPublishAtIso}
                  timezone={workspaceTimezone}
                  onSaved={() => setRescheduleOpen(false)}
                />
              </div>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {status === "cancelled" ? (
        <span className="bg-danger-subtle text-danger rounded-full px-2 py-1 text-xs font-semibold">
          {t("contentDetail.overview.kebab.cancelled")}
        </span>
      ) : null}
    </div>
  );
}
