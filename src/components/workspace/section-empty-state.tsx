import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";

/**
 * SectionEmptyState — the standard "no rows yet" placeholder for a
 * brand-kit section. Replaces the ad-hoc `<EmptyState>` calls in
 * each list file with a consistent prop contract.
 *
 * The compact variant drops the dashed border so it can be inlined
 * inside a SectionCard without adding visual weight.
 */
export interface SectionEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Optional CTA — typically a "Add first X" button. */
  action?: React.ReactNode;
  compact?: boolean;
  testId?: string;
}

export function SectionEmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  testId,
}: SectionEmptyStateProps) {
  if (compact) {
    return (
      <div data-testid={testId} className="flex flex-col items-center gap-2 py-6 text-center">
        <Icon className="text-fg-muted h-6 w-6" aria-hidden="true" />
        <p className="text-body text-fg-primary font-semibold">{title}</p>
        <p className="text-label text-fg-muted max-w-sm">{description}</p>
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    );
  }
  return (
    <EmptyState
      icon={<Icon className="h-7 w-7" aria-hidden="true" />}
      title={title}
      description={description}
      action={action ? <div className="mt-2 flex justify-center">{action}</div> : undefined}
      data-testid={testId}
    />
  );
}
