import * as React from "react";
import { Card, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * SectionCard — the Bento section wrapper for `/app/w/[slug]/brand-kit`.
 *
 * Replaces the inlined <Card id=… scroll-mt-…> pattern that
 * page.tsx repeated 9 times. The new primitive:
 *   - Sets `scroll-mt-20` automatically (so the sticky top-tab
 *     strip never covers the section heading on click).
 *   - Renders the title + optional count badge consistently.
 *   - Reserves a manager-only actions slot (the "+ Add logo"
 *     dropdown, the Edit mode toggle, etc.).
 *   - Supports a muted count (archived-view mode).
 *
 * Lives in `components/workspace/` so other surfaces (Channels,
 * Library, Settings) can adopt the same pattern.
 */
export interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  id: string;
  title: React.ReactNode;
  count?: number;
  countMuted?: boolean;
  managerActions?: React.ReactNode;
  /** Whether the card is in "preview as client" mode (hides manager controls). */
  previewMode?: boolean;
  /** Render the card across the full row (12-col span) or the default 4/6/8. */
  fullWidth?: boolean;
}

export function SectionCard({
  id,
  title,
  count,
  countMuted = false,
  managerActions,
  previewMode = false,
  fullWidth = false,
  className,
  children,
  ...rest
}: SectionCardProps) {
  return (
    <Card
      id={id}
      className={cn("scroll-mt-20", fullWidth ? "lg:col-span-12" : "", className)}
      {...rest}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <CardTitle className="inline-flex items-center gap-2">
          {title}
          {typeof count === "number" ? (
            <Badge
              variant="outline"
              data-testid={`brand-kit-section-${id}-count`}
              className={cn(countMuted && "opacity-60")}
            >
              {count}
            </Badge>
          ) : null}
        </CardTitle>
        {managerActions && !previewMode ? managerActions : null}
      </div>
      {children}
    </Card>
  );
}
