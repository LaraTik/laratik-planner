import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * PlanningSection — uniform wrapper for the planning detail
 * page. Every group of related fields renders inside a
 * `<PlanningSection>` so the page has a consistent rhythm and
 * the in-page anchors (`#brief`, `#delivery`, etc.) all land
 * at the same visual offset.
 *
 * The section also supports a "compact" mode that renders
 * the body without the card chrome — useful for inline
 * sub-sections like "Channel publishing" inside a parent
 * card.
 */

export interface PlanningSectionProps {
  /** Section title. Required. The card title is always
   *  rendered; if the section is purely visual, the parent
   *  can leave the title empty and rely on `description`. */
  title: React.ReactNode;
  /** Optional supporting copy under the title. */
  description?: React.ReactNode;
  /** Section body. */
  children: React.ReactNode;
  /** Optional toolbar / actions row, right-aligned next to
   *  the title. */
  actions?: React.ReactNode;
  /** HTML id used as the in-page anchor target. */
  id?: string;
  /** Visual density — defaults to `default` (the standard
   *  card). `flat` removes the chrome and renders the
   *  content flush with the parent. */
  variant?: "default" | "flat";
  /** Optional class for the outer wrapper. */
  className?: string;
  /** Render the section as a native, keyboard-friendly disclosure. */
  collapsible?: boolean;
  /** Whether a collapsible section starts expanded. */
  defaultOpen?: boolean;
  /** Test id. */
  testId?: string;
}

export function PlanningSection({
  title,
  description,
  children,
  actions,
  id,
  variant = "default",
  className,
  collapsible = false,
  defaultOpen = true,
  testId,
}: PlanningSectionProps) {
  if (variant === "flat") {
    return (
      <section
        id={id}
        tabIndex={id ? -1 : undefined}
        data-testid={testId}
        className={cn("scroll-mt-24", className)}
      >
        {children}
      </section>
    );
  }
  if (collapsible) {
    return (
      <details
        id={id}
        tabIndex={id ? -1 : undefined}
        data-testid={testId}
        className={cn(
          "border-border bg-surface group relative scroll-mt-24 rounded-[var(--radius-card)] border p-4 sm:p-5",
          className,
        )}
        open={defaultOpen}
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

  return (
    <Card
      id={id}
      tabIndex={id ? -1 : undefined}
      data-testid={testId}
      className={cn("scroll-mt-24", className)}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <CardTitle className="text-body text-fg-primary font-semibold">{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}
