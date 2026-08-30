import * as React from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NextAction } from "@/lib/content/next-action";

/**
 * NextActionChip — the row's subtle "→ Submit for review" hint.
 *
 * Per Goal 33 #5: a large CTA per row is too loud. The chip is a
 * short text line with an optional arrow icon. When the current user
 * can act (canCurrentUserAct=true), the chip is brand-tinted and
 * links to the right detail tab via the deep-link anchor. When they
 * can't, the chip is muted and shows the same label passively so
 * the user knows what the next step is regardless of who owns it.
 *
 * Pure presentational, server-renderable. The deep link target is a
 * regular anchor — no onClick closure, safe for the RSC #441 lesson.
 */
export interface NextActionChipProps {
  action: NextAction;
  /** Detail-page href (e.g. /app/w/{slug}/planning/{id}). */
  detailHref: string;
  className?: string;
}

export function NextActionChip({ action, detailHref, className }: NextActionChipProps) {
  // The chip is interactive only when the row's main interaction
  // is also a Link — the deep link target shares the detail URL
  // with the row, but anchors to the specific tab so a planner
  // who clicks "→ Submit for review" lands on the workflow tab
  // instead of the overview.
  const href = action.tab ? `${detailHref}#${action.tab}` : detailHref;
  const isActionable = action.canCurrentUserAct;
  return (
    <a
      href={href}
      data-testid="next-action-chip"
      data-actionable={isActionable ? "true" : "false"}
      data-tab={action.tab ?? "none"}
      aria-label={action.label}
      className={cn(
        "text-label focus-visible:ring-focus-ring inline-flex max-w-[28ch] items-center gap-1 truncate rounded-[var(--radius-control)] py-0.5 font-medium transition-colors focus:outline-none focus-visible:ring-2",
        isActionable ? "text-primary hover:underline hover:underline-offset-2" : "text-fg-muted",
        className,
      )}
    >
      <span className="truncate">{action.label}</span>
      {isActionable ? <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
    </a>
  );
}
