"use client";

import * as React from "react";
import Link from "next/link";
import { Pencil, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  EditIdeaForm,
  type EditIdeaFormInitial,
} from "@/app/(app)/app/w/[slug]/planning/edit/[id]/edit-form";

/**
 * EditDetailsDrawer — right-side drawer that hosts the
 * `EditIdeaForm` so routine edits stay inside the planning
 * detail page instead of navigating to `/edit/[id]`. The
 * standalone route is preserved as a deep-link fallback (per
 * spec §13 / §26).
 *
 * The drawer reuses the existing `EditIdeaForm` component
 * verbatim so the data contract, validation, and submit
 * behaviour are identical to the dedicated page. The
 * differences are purely presentational:
 *   - Right-anchored panel (overrides the centered default
 *     `DialogContent` positioning via `className`).
 *   - Header includes a "Open full editor" affordance for
 *     power users who still want the full-page experience.
 *   - The trigger button replaces the previous `<Link>`
 *     to `/edit/[id]` in `PlanningHeader`.
 *
 * Phase 5 of the planning-detail refactor (2026-08-30).
 *
 * Accessibility:
 *   - Radix Dialog handles focus trap, Escape, and
 *     outside-click dismissal.
 *   - The trigger carries an `aria-label`; the dialog has
 *     `aria-labelledby` and `aria-describedby` set via
 *     `DialogTitle` / `DialogDescription`.
 *   - Focus is restored to the trigger on close (Radix).
 */
export interface EditDetailsDrawerProps {
  workspaceSlug: string;
  contentItemId: string;
  channels: { id: string; accountName: string; platform: string }[];
  initial: EditIdeaFormInitial;
  /**
   * Optional override of the trigger's `children`. The default
   * is a small "Edit content" button matching the previous
   * header CTA shape; the Overview's "Edit details" link can
   * pass its own variant.
   */
  triggerLabel?: string;
  /** Optional extra class on the trigger button. */
  triggerClassName?: string;
}

export function EditDetailsDrawer({
  workspaceSlug,
  contentItemId,
  channels,
  initial,
  triggerLabel = "Edit content",
  triggerClassName,
}: EditDetailsDrawerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-testid="open-edit-details-drawer" className={triggerClassName}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent
        // Override the centered `DialogContent` default to
        // pin the panel to the inline end edge. We also widen it
        // to a comfortable reading width on desktop; the form
        // itself uses `space-y-4` and the page-level spacing
        // is preserved by the `<form>` element inside
        // `EditIdeaForm`.
        className="start-auto end-0 top-0 bottom-0 h-screen max-h-screen w-full max-w-xl translate-x-0 translate-y-0 overflow-y-auto rounded-none border-y-0 border-s border-e-0 p-6 sm:rounded-none"
        data-testid="edit-details-drawer"
      >
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>
            Change the title, format, planned publish date, channels, or brief.{" "}
            <Link
              href={`/app/w/${workspaceSlug}/planning/edit/${contentItemId}`}
              className="text-primary inline-flex items-center gap-1 underline-offset-4 hover:underline"
              data-testid="edit-details-drawer-full-editor"
            >
              Open the full editor
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </Link>
          </DialogDescription>
        </DialogHeader>
        <EditIdeaForm
          workspaceSlug={workspaceSlug}
          contentItemId={contentItemId}
          channels={channels}
          initial={initial}
        />
      </DialogContent>
    </Dialog>
  );
}
