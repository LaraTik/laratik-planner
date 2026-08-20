import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * SectionHeader — a small in-card title with optional action link.
 * Used inside cards (e.g. "Recent items → View all"). Title is the
 * 16/24 semibold token; the action is a 12/16 primary link.
 */
export interface SectionHeaderProps {
  title: React.ReactNode;
  /** Action link target, e.g. "/app/w/acme/planning". */
  actionHref?: string;
  /** Label for the action link, e.g. "View all". */
  actionLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export function SectionHeader({
  title,
  actionHref,
  actionLabel,
  className,
  children,
}: SectionHeaderProps) {
  return (
    <header className={cn("mb-3 flex flex-wrap items-center justify-between gap-2", className)}>
      <h2 className="text-title-card text-fg-primary font-semibold">{title}</h2>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="text-label text-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] px-2 py-1 underline-offset-4 transition-colors hover:underline focus:outline-none focus-visible:ring-2"
        >
          {actionLabel} →
        </Link>
      ) : null}
      {children}
    </header>
  );
}
