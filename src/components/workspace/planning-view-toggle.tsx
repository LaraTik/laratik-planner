"use client";

import * as React from "react";
import Link from "next/link";
import { Calendar, KanbanSquare, List } from "lucide-react";
import { cn, isActivePath } from "@/lib/utils";
import { usePathname } from "next/navigation";

/**
 * View toggle — segmented control with three options (List / Board /
 * Calendar) for the planning area. Each option is a link to the
 * corresponding route. The active option gets `bg-primary-subtle
 * text-primary`; others are muted.
 *
 * Per Stitch: the toggle sits in the planning page header bar, next to
 * the month nav + density filter.
 */
export function PlanningViewToggle({ workspaceSlug }: { workspaceSlug: string }) {
  const pathname = usePathname();
  const base = `/app/w/${workspaceSlug}`;
  const items = [
    { href: `${base}/planning`, label: "List", icon: List },
    { href: `${base}/board`, label: "Board", icon: KanbanSquare },
    { href: `${base}/calendar`, label: "Calendar", icon: Calendar },
  ] as const;

  return (
    <div
      role="tablist"
      aria-label="Planning view"
      className="border-border bg-surface inline-flex items-center overflow-hidden rounded-[var(--radius-control)] border"
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        const active = isActivePath(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            role="tab"
            aria-current={active ? "page" : undefined}
            data-testid={`planning-view-${item.label.toLowerCase()}`}
            className={cn(
              "text-label focus-visible:ring-focus-ring inline-flex min-h-10 items-center gap-1.5 px-3 py-1.5 font-semibold transition-colors focus:outline-none focus-visible:ring-2",
              i > 0 && "border-border border-l",
              active
                ? "bg-primary-subtle text-primary"
                : "text-fg-secondary hover:bg-surface-subtle",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
