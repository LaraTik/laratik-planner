import * as React from "react";
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
  testId,
}: PlanningSectionProps) {
  if (variant === "flat") {
    return (
      <section id={id} data-testid={testId} className={cn("scroll-mt-24", className)}>
        {children}
      </section>
    );
  }
  return (
    <Card id={id} data-testid={testId} className={cn("scroll-mt-24", className)}>
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
