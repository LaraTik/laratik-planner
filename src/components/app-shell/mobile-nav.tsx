"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Folder, Users, Plus } from "lucide-react";
import { cn, isActivePath } from "@/lib/utils";

const items = [
  { href: "/app", label: "My Work", icon: Home, exact: true },
  { href: "/app/workspaces", label: "Workspaces", icon: Folder, exact: false },
  { href: "/app/users", label: "Users", icon: Users, exact: false, admin: true },
] as const;

/**
 * Mobile bottom navigation (master prompt §3: "Mobile <768px: bottom
 * navigation"). Hidden on tablet+ (md:hidden). Admin users get an
 * extra "+" tile that takes them to the create-workspace page.
 *
 * Uses the shared `isActivePath` helper from `src/lib/utils.ts` so the
 * active-state predicate stays in sync with the sidebar.
 */
export function MobileNav({ canCreate }: { canCreate: boolean }) {
  const pathname = usePathname();
  return (
    <nav
      className="bg-surface border-border fixed inset-x-0 bottom-0 z-30 border-t md:hidden"
      aria-label="Primary"
    >
      <ul className={cn("grid gap-1 px-2 py-2", canCreate ? "grid-cols-4" : "grid-cols-3")}>
        {items.map((item) => {
          const isAdminOnly = "admin" in item && item.admin;
          if (isAdminOnly && !canCreate) return null;
          const active = isActivePath(item.href, pathname, { exact: item.exact });
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "text-label focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold transition focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? "bg-primary-subtle text-primary"
                    : "text-fg-secondary hover:bg-surface-subtle",
                )}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
        {canCreate ? (
          <li>
            <Link
              href="/app/workspaces/new"
              className="text-label text-fg-secondary hover:bg-surface-subtle focus-visible:ring-focus-ring flex min-h-[var(--control-touch)] flex-col items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 font-semibold focus:outline-none focus-visible:ring-2"
            >
              <Plus className="h-5 w-5" aria-hidden="true" />
              <span>New</span>
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
