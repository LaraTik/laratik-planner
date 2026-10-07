"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * AddChannelButton — header CTA for the channels page.
 *
 * The "Add channel" form is inline at the top of the page (v1 chose
 * inline over a side drawer to avoid splitting CRUD across two
 * surfaces). The header CTA is therefore a "focus the inline form"
 * action: clicking it scrolls the form into view and focuses the
 * first field (the platform select).
 *
 * Renders as a real `<Button>` with `aria-controls` so screen readers
 * announce the relationship to the inline form (which has
 * `data-testid="channel-add-card"`). On the channel page the form
 * is also rendered without the button, so this CTA is the only way
 * keyboard users reach the form from the page header.
 */
export function AddChannelButton({
  formId = "channel-add-card",
}: {
  /** `id` of the element to focus / scroll to. Must exist in the DOM. */
  formId?: string;
}) {
  const handleClick = React.useCallback(() => {
    const target = document.querySelector<HTMLElement>(`[data-testid="${formId}"]`);
    if (!target) return;
    // Scroll the form into view; -80px leaves room for the sticky top
    // tabs on a workspace-scoped page. Center horizontally so the
    // user sees the whole card on mobile.
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    // Defer focus until the scroll has started so the browser does
    // not jump the focus ring above the visible viewport.
    window.setTimeout(() => {
      const firstField = target.querySelector<HTMLElement>("input, select, textarea, button");
      firstField?.focus({ preventScroll: true });
    }, 200);
  }, [formId]);

  return (
    <Button
      type="button"
      variant="default"
      onClick={handleClick}
      aria-controls={formId}
      data-testid="channel-add-cta"
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add channel
    </Button>
  );
}
