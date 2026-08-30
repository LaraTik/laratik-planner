import * as React from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

/**
 * DashboardPanel — the shared "dashboard card" anatomy used by every
 * panel on the workspace Overview (Plan Coverage, Delivery Health,
 * Workflow Pipeline, Needs Attention, Recently Updated, etc.).
 *
 * Replaces the ad-hoc `border-border bg-surface rounded-[var(--radius-card)] border p-6`
 * block repeated in every card before the refactor. The shape:
 *
 *   ┌──────────────────────────────────────┐
 *   │ [eyebrow]   [Title]      [headerAction] │
 *   │  ── description ──────────────────────  │
 *   │                                          │
 *   │  {children}                              │
 *   │                                          │
 *   │  [footer?]                               │
 *   └──────────────────────────────────────┘
 *
 * Use {@link headerAction} for the right-side action button
 * ("Set target", "View all"). Use {@link eyebrow} for the muted
 * small label above the title ("Why at risk", "Format mix"). Use
 * {@link description} for the muted sub-line. Use {@link footer} for
 * the optional "View all →" row.
 */
export interface DashboardPanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Visible section heading (e.g. "Plan coverage"). */
  title: React.ReactNode;
  /** Muted label above the title (e.g. "Format mix"). */
  eyebrow?: React.ReactNode;
  /** Muted sub-line below the title. */
  description?: React.ReactNode;
  /** Right-side action area in the header. */
  headerAction?: React.ReactNode;
  /** Optional footer area (e.g. "View all →"). */
  footer?: React.ReactNode;
  /** Heading level for the title. Default 2 (h2). */
  as?: "h2" | "h3" | "h4";
  /** Skip the inner padding wrapper — use when the content needs to
   *  bleed to the edge (e.g. a stacked bar). */
  bleed?: boolean;
  /** Optional data-testid for E2E hooks. */
  "data-testid"?: string;
  /** className for the outer section. */
  className?: string | undefined;
}

export function DashboardPanel({
  title,
  eyebrow,
  description,
  headerAction,
  footer,
  as: Heading = "h2",
  bleed = false,
  className,
  children,
  "data-testid": testId,
  ...rest
}: DashboardPanelProps) {
  return (
    <section
      aria-label={typeof title === "string" ? title : undefined}
      data-testid={testId}
      className={cn("flex flex-col", className)}
      {...rest}
    >
      <Card padding={bleed ? "none" : "lg"} className="flex h-full flex-col">
        <header
          className={cn(
            "flex flex-wrap items-start justify-between gap-2",
            bleed && "px-5 pt-5 sm:px-6 sm:pt-6",
          )}
        >
          <div className="min-w-0 flex-1">
            {eyebrow ? (
              <p className="text-label text-fg-muted font-semibold tracking-wide uppercase">
                {eyebrow}
              </p>
            ) : null}
            <Heading className="text-title-card text-fg-primary font-semibold">{title}</Heading>
            {description ? (
              <p className="text-body text-fg-secondary mt-1 text-pretty">{description}</p>
            ) : null}
          </div>
          {headerAction ? <div className="flex items-center gap-2">{headerAction}</div> : null}
        </header>
        <div className={cn("flex-1", bleed ? "mt-4" : "mt-4")}>{children}</div>
        {footer ? (
          <div
            className={cn("border-border mt-4 border-t pt-3", bleed && "px-5 pb-5 sm:px-6 sm:pb-6")}
          >
            {footer}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
