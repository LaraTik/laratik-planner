"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { isActivePath, cn } from "@/lib/utils";

/**
 * Sidebar group with a collapsible parent + nested sub-items.
 *
 * Used for top-level navigation that has a small set of peer sub-routes
 * (e.g. Settings → Lifecycle / Lead times / Assignment defaults /
 * Approval mode / AI assistance). The parent link goes to the group's
 * root; sub-items are full routes (or hash-anchored if they share a page).
 *
 * Open state is derived from the active path: any nested item that is
 * active keeps the group open. The user can also click the chevron to
 * force-open/close; that state persists until the next navigation.
 */
export function SidebarGroup({
  href,
  icon,
  label,
  pathname,
  children,
  defaultOpen,
  parentTestId,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  pathname: string;
  children: React.ReactNode;
  defaultOpen: boolean;
  parentTestId?: string;
}) {
  const parentActive = isActivePath(href, pathname);
  // Open when on a child route or when the user explicitly opened it.
  const [forcedOpen, setForcedOpen] = React.useState<boolean | null>(null);
  const open = forcedOpen ?? (defaultOpen || parentActive);
  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex min-h-11 items-center rounded-[var(--radius-control)] font-semibold transition-colors",
          parentActive
            ? "bg-primary-subtle text-primary"
            : "text-fg-primary hover:bg-surface-subtle",
        )}
      >
        <Link
          href={href}
          aria-current={parentActive ? "page" : undefined}
          className="text-body focus-visible:ring-focus-ring flex flex-1 items-center gap-3 rounded-[var(--radius-control)] pr-1 pl-3 focus:outline-none focus-visible:ring-2"
          data-testid={parentTestId}
        >
          <span
            className={cn(parentActive ? "text-primary" : "text-fg-secondary")}
            aria-hidden="true"
          >
            {icon}
          </span>
          {label}
        </Link>
        <button
          type="button"
          onClick={() => setForcedOpen((v) => (v === null ? !open : !v))}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={open}
          className="text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring rounded-[var(--radius-control)] p-1.5 focus:outline-none focus-visible:ring-2"
        >
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open ? "rotate-0" : "-rotate-90")}
            aria-hidden="true"
          />
        </button>
      </div>
      {open ? (
        // Plain `<ul>` (no role override) so the implicit `list` role is
        // preserved for the nested `<li>` children. Previously this
        // element had `role="group"`, which axe's `listitem` rule
        // rejected because list-items require a list-role parent.
        <ul className="ml-4 space-y-0.5 border-l border-[var(--color-border)] pl-3">
          {React.Children.toArray(children).filter(Boolean)}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Nested sidebar entry. Same visual shape as `SidebarLink` but indented
 * to live inside a `SidebarGroup`. Active state is computed the same
 * way — startsWith by default, exact when `exact: true`.
 */
export function SidebarSubLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "text-body focus-visible:ring-focus-ring flex min-h-9 items-center gap-2 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
          active
            ? "text-primary"
            : "text-fg-secondary hover:bg-surface-subtle hover:text-fg-primary",
        )}
      >
        {children}
      </Link>
    </li>
  );
}

/**
 * Plain top-level sidebar link (the previous `SidebarLink`). Kept here
 * so the rest of the sidebar can import it from the same module.
 */
export function SidebarLink({
  href,
  icon,
  children,
  active,
  testId,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  active: boolean;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-body focus-visible:ring-focus-ring flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
        active ? "bg-primary-subtle text-primary" : "text-fg-primary hover:bg-surface-subtle",
      )}
      data-testid={testId}
    >
      <span className={cn(active ? "text-primary" : "text-fg-secondary")} aria-hidden="true">
        {icon}
      </span>
      {children}
    </Link>
  );
}
