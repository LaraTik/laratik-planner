"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Folder, Home, Settings, Shield, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, isActivePath } from "@/lib/utils";

/**
 * Primary navigation sidebar.
 *
 * Structure (master prompt §3 "Global" + "Workspace" hierarchy):
 *  - My Work (global, shows items assigned to current user)
 *  - Workspaces (global list)
 *  - ────────── workspace-scoped (later goals) ──────────
 *  - User Management (admin only)
 *  - Agency Settings (admin only)
 *
 * Highlights the active route via `aria-current="page"` + a coloured
 * background. Uses `usePathname()` so it re-renders on client-side
 * navigation without a server roundtrip. Active-path predicate is the
 * shared `isActivePath` helper in `src/lib/utils.ts`.
 */
export function Sidebar({ user }: { user: { name: string; isAdmin: boolean } }) {
  const pathname = usePathname();

  return (
    <nav className="flex h-full flex-col" aria-label="Primary">
      <div className="border-border flex h-16 items-center border-b px-4">
        <Link
          href="/app"
          className="focus-visible:ring-focus-ring flex items-center gap-2 rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2"
        >
          <div className="bg-primary flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] text-white">
            <Briefcase className="h-4 w-4" aria-hidden="true" />
          </div>
          <span className="text-title-card text-fg-primary font-semibold">laratik-planner</span>
        </Link>
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <SidebarLink
          href="/app"
          icon={<Home className="h-4 w-4" />}
          active={isActivePath("/app", pathname, { exact: true })}
        >
          My Work
        </SidebarLink>
        <SidebarLink
          href="/app/workspaces"
          icon={<Folder className="h-4 w-4" />}
          active={isActivePath("/app/workspaces", pathname)}
        >
          Workspaces
        </SidebarLink>

        {user.isAdmin ? (
          <>
            <div className="text-label text-fg-muted px-2 pt-6 pb-2 tracking-wide uppercase">
              Admin
            </div>
            <SidebarLink
              href="/app/users"
              icon={<Users className="h-4 w-4" />}
              active={isActivePath("/app/users", pathname)}
            >
              User Management
            </SidebarLink>
            <SidebarLink
              href="/app/agency-settings"
              icon={<Shield className="h-4 w-4" />}
              active={isActivePath("/app/agency-settings", pathname)}
            >
              Agency Settings
            </SidebarLink>
          </>
        ) : null}
      </div>

      <div className="border-border border-t p-3">
        <Link
          href="/app/account"
          aria-current={isActivePath("/app/account", pathname) ? "page" : undefined}
          className={cn(
            "focus-visible:ring-focus-ring flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-2 transition-colors focus:outline-none focus-visible:ring-2",
            isActivePath("/app/account", pathname)
              ? "bg-primary-subtle text-primary"
              : "hover:bg-surface-subtle",
          )}
        >
          <div
            className={cn(
              "border-border text-label flex h-8 w-8 items-center justify-center rounded-full border font-semibold",
              isActivePath("/app/account", pathname)
                ? "bg-primary text-white"
                : "bg-surface-subtle",
            )}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-body truncate font-semibold",
                isActivePath("/app/account", pathname) ? "text-primary" : "text-fg-primary",
              )}
            >
              {user.name}
            </p>
            <Badge variant="default" className="mt-0.5">
              {user.isAdmin ? "Admin" : "Member"}
            </Badge>
          </div>
          <Settings className="text-fg-muted h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </nav>
  );
}

function SidebarLink({
  href,
  icon,
  children,
  active,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-body focus-visible:ring-focus-ring flex min-h-11 items-center gap-3 rounded-[var(--radius-control)] px-3 font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
        active ? "bg-primary-subtle text-primary" : "text-fg-primary hover:bg-surface-subtle",
      )}
    >
      <span className={cn(active ? "text-primary" : "text-fg-secondary")} aria-hidden="true">
        {icon}
      </span>
      {children}
    </Link>
  );
}
