import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * EmptyState — used everywhere a list could be empty (per master prompt §3.7:
 * "Use realistic loading, empty, error, permission-denied, archived, and
 * no-results states. Never leave blank screens.").
 */
export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "border-border bg-surface flex flex-col items-center justify-center gap-3 rounded-[var(--radius-card)] border border-dashed px-6 py-12 text-center",
        className,
      )}
      {...props}
    >
      {icon ? <div className="text-fg-muted">{icon}</div> : null}
      <h3 className="text-title-card text-fg-primary font-semibold">{title}</h3>
      {description ? <p className="text-body text-fg-secondary max-w-sm">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
