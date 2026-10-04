"use client";

import * as React from "react";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * The collapsible branch of `PlanningSection`, split into its own client
 * component so the parent stays a Server Component.
 *
 * `<details>` has no `defaultOpen` attribute — only `open` — so the
 * previous implementation (`<details open={defaultOpen}>`) let React
 * re-drive the attribute on every render. Any `router.refresh()` after
 * a server action reverted the operator's manual collapse, so the
 * section appeared to fight the user.
 *
 * The invariant here: the server value decides the state exactly once,
 * at mount. After that the operator's own toggle wins until the
 * component remounts.
 */
export function PlanningSectionDisclosure({
  id,
  title,
  description,
  actions,
  children,
  initialOpen,
  testId,
  className,
}: {
  id?: string | undefined;
  title: React.ReactNode;
  description?: React.ReactNode | undefined;
  actions?: React.ReactNode | undefined;
  children: React.ReactNode;
  initialOpen: boolean;
  testId?: string | undefined;
  className?: string | undefined;
}) {
  const [open, setOpen] = useState(initialOpen);
  return (
    <details
      id={id}
      tabIndex={id ? -1 : undefined}
      data-testid={testId}
      className={cn(
        "border-border bg-surface group relative scroll-mt-24 rounded-[var(--radius-card)] border p-4 sm:p-5",
        className,
      )}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="focus-visible:ring-focus-ring flex min-h-11 cursor-pointer list-none items-start gap-3 pe-20 focus:outline-none focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-body text-fg-primary font-semibold">{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        <ChevronDown
          className="text-fg-muted mt-0.5 h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      {actions ? (
        <div className="absolute end-4 top-4 flex items-center gap-1">{actions}</div>
      ) : null}
      <div className="mt-4">{children}</div>
    </details>
  );
}
