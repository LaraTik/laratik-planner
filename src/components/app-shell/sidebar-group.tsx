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
 *
 * The `children` list can mix `SidebarSubLink` and `NestedSidebarGroup`
 * — the latter is a sub-group with its own toggle and its own
 * `SidebarSubLink` children. `Brand Kit → Identity → Logos` is the
 * canonical example (Phase 7).
 */
export function SidebarGroup({
  href,
  icon,
  label,
  pathname,
  children,
  defaultOpen,
  active,
  parentTestId,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  pathname: string;
  children: React.ReactNode;
  defaultOpen: boolean;
  active?: boolean;
  parentTestId?: string;
}) {
  const parentActive = active ?? isActivePath(href, pathname);
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
          aria-label={label}
          title={label}
          className="text-body focus-visible:ring-focus-ring flex min-h-11 flex-1 items-center justify-center gap-3 rounded-[var(--radius-control)] px-3 focus:outline-none focus-visible:ring-2 xl:justify-start"
          data-testid={parentTestId}
        >
          <span
            className={cn(parentActive ? "text-primary" : "text-fg-secondary")}
            aria-hidden="true"
          >
            {icon}
          </span>
          <span className="hidden xl:inline">{label}</span>
        </Link>
        <button
          type="button"
          onClick={() => setForcedOpen((v) => (v === null ? !open : !v))}
          aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
          aria-expanded={open}
          className="text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring hidden min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2 xl:flex"
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
        <ul className="ms-4 hidden space-y-0.5 border-s border-[var(--color-border)] ps-3 xl:block">
          {React.Children.toArray(children).filter(Boolean)}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * Nested sidebar group — a collapsible sub-group that lives inside
 * a `SidebarGroup`'s child list. Renders a button (not a link) with
 * an icon + label + chevron; when expanded, shows its child
 * `SidebarSubLink` items.
 *
 * The "group" itself is not a navigable route — it is purely an
 * organisational label. The user clicks the chevron to expand /
 * collapse; clicking the label does nothing (per ARIA disclosure
 * pattern).
 *
 * Used by the Brand Kit parent group to cluster Identity / Voice /
 * Resources under the parent (Phase 7).
 */
export function NestedSidebarGroup({
  label,
  icon,
  children,
  defaultOpen,
  parentTestId,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen: boolean;
  parentTestId?: string;
}) {
  const [forcedOpen, setForcedOpen] = React.useState<boolean | null>(null);
  const open = forcedOpen ?? defaultOpen;
  return (
    <li>
      <button
        type="button"
        onClick={() => setForcedOpen((v) => (v === null ? !open : !v))}
        aria-label={open ? `Collapse ${label}` : `Expand ${label}`}
        aria-expanded={open}
        data-testid={parentTestId}
        className="text-body text-fg-secondary hover:text-fg-primary focus-visible:ring-focus-ring flex min-h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true">{icon}</span>
          <span className="truncate">{label}</span>
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            open ? "rotate-0" : "-rotate-90",
          )}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul className="ms-3 mt-0.5 space-y-0.5 border-s border-[var(--color-border)] ps-3">
          {/* Each child is a SidebarSubLink (<li>) or a NestedSidebarGroup
              (<li>). Both already render their own <li>, so the children
              pass through as siblings — but only because they all wrap
              themselves. If a future entry shape changes, this loop
              would need a defensive <li> wrapper. */}
          {React.Children.toArray(children).filter(Boolean)}
        </ul>
      ) : null}
    </li>
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
  const accessibleLabel = typeof children === "string" ? children : undefined;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={cn(
        "text-body focus-visible:ring-focus-ring flex min-h-11 items-center justify-center gap-3 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none xl:justify-start",
        active ? "bg-primary-subtle text-primary" : "text-fg-primary hover:bg-surface-subtle",
      )}
      data-testid={testId}
    >
      <span className={cn(active ? "text-primary" : "text-fg-secondary")} aria-hidden="true">
        {icon}
      </span>
      <span className="hidden min-w-0 truncate xl:inline">{children}</span>
    </Link>
  );
}
