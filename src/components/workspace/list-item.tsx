import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * ListCard — a bordered surface that contains a vertical list of clickable
 * rows separated by a divider. Rows are typically Links to detail pages.
 * Used by My Work, Planning, Reviews, Workspaces index, Team, Client
 * Calendar, etc.
 */
export interface ListCardProps extends React.HTMLAttributes<HTMLUListElement> {
  /** Removes the outer border + radius (when nested inside another card). */
  bare?: boolean;
}

/**
 * ListItem — a single link row inside a `ListCard`. Composes a leading
 * icon (optional), title + secondary line, and a trailing slot for
 * badges or meta. The whole row is the link target so the hit area is
 * the full row, not just the title text.
 */
export interface ListItemProps {
  href: string;
  /** Small leading visual (e.g. FileText icon). Hidden on phones by default. */
  leading?: React.ReactNode;
  /** Primary label (truncates with ellipsis if too long). */
  title: React.ReactNode;
  /** Secondary line under the title (e.g. "Workspace · 2024-08-12"). */
  meta?: React.ReactNode;
  /** Trailing slot (badges, member count, etc.). */
  trailing?: React.ReactNode;
  /** Vertical density: comfortable (default) or compact. */
  density?: "comfortable" | "compact";
  className?: string;
}

export function ListCard({ className, bare = false, ...props }: ListCardProps) {
  return (
    <ul
      className={cn(
        bare
          ? "divide-border divide-y"
          : "border-border bg-surface divide-border divide-y overflow-hidden rounded-[var(--radius-card)] border",
        className,
      )}
      {...props}
    />
  );
}

export function ListItem({
  href,
  leading,
  title,
  meta,
  trailing,
  density = "comfortable",
  className,
}: ListItemProps) {
  const padding = density === "compact" ? "py-2" : "py-3";
  return (
    <li
      className={cn(
        "hover:bg-surface-subtle focus-within:bg-surface-subtle transition-colors",
        className,
      )}
    >
      <Link
        href={href}
        className={cn(
          "focus-visible:bg-surface-subtle focus-visible:ring-focus-ring flex items-center gap-3 px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset sm:gap-4",
          padding,
        )}
      >
        {leading ? (
          <span className="hidden shrink-0 sm:inline-flex" aria-hidden="true">
            {leading}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <span className="text-body text-fg-primary block truncate font-semibold">{title}</span>
          {meta ? <div className="text-label text-fg-muted mt-0.5 truncate">{meta}</div> : null}
        </div>
        {trailing ? <div className="shrink-0">{trailing}</div> : null}
      </Link>
    </li>
  );
}
