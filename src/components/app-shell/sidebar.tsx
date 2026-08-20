"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Briefcase,
  CalendarDays,
  ClipboardList,
  HelpCircle,
  Home,
  LayoutDashboard,
  MessageSquare,
  Package,
  Plus,
  Settings,
  Share2,
  Shield,
  Users,
} from "lucide-react";
import { isActivePath } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { WorkspaceSwitcher } from "./workspace-switcher";

/**
 * Primary navigation sidebar.
 *
 * Workspace-aware per the Stitch design (project 5403097764334458790).
 * The shape changes based on the current pathname:
 *
 *  - Inside /app/w/[slug]/* (workspace context):
 *      - Brand: logo + workspace name
 *      - My Work (global, top)
 *      - Workspace tabs (vertical): Overview, Planning, Calendar,
 *        Reviews, Social Channels, Brand Kit, Team
 *      - Create content (primary button, bottom of nav)
 *      - Settings, Admin, Help, Workspace Switcher (bottom)
 *
 *  - On a global page (/app, /app/workspaces, /app/users, ...):
 *      - Brand: logo only
 *      - My Work, Workspaces
 *      - (admin only) User Management, Agency Settings
 *      - Help, Workspace Switcher (bottom)
 *
 * The active path uses `isActivePath` from `src/lib/utils.ts` so the
 * active-state predicate stays consistent across the shell.
 *
 * Width: 248px expanded on desktop (per Stitch), 64px icon-rail on
 * tablet, hidden < 768px (MobileNav takes over).
 */
export function Sidebar({
  user,
  workspaces,
  workspaceSwitcherOptions,
  canCreateWorkspace,
}: {
  user: { name: string; isAdmin: boolean };
  workspaces: { id: string; slug: string; name: string }[];
  workspaceSwitcherOptions: { id: string; name: string; slug: string }[];
  canCreateWorkspace: boolean;
}) {
  const pathname = usePathname();

  // Detect workspace context from the URL. /app/w/[slug]/* means we
  // are inside a workspace; everything else under /app is global.
  const slugMatch = pathname.match(/^\/app\/w\/([^/]+)/);
  const currentWorkspace = slugMatch
    ? (workspaces.find((w) => w.slug === slugMatch[1]) ?? null)
    : null;
  const inWorkspace = currentWorkspace !== null;
  const wsBase = currentWorkspace ? `/app/w/${currentWorkspace.slug}` : "";

  return (
    <nav className="flex h-full flex-col" aria-label="Primary">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 px-6">
        <Link
          href="/app"
          className="focus-visible:ring-focus-ring flex items-center gap-3 rounded-[var(--radius-control)] focus:outline-none focus-visible:ring-2"
        >
          <div className="bg-primary-container text-on-primary-container flex h-8 w-8 items-center justify-center rounded-[var(--radius-control)] font-bold">
            S
          </div>
          <div className="min-w-0">
            <p className="text-section-title text-fg-primary truncate font-semibold">StudioFlow</p>
            {currentWorkspace ? (
              <p className="text-on-surface-variant text-xs">{currentWorkspace.name}</p>
            ) : null}
          </div>
        </Link>
      </div>

      {/* Top section: My Work + (workspace tabs OR global items) */}
      <div className="flex-1 space-y-1 overflow-y-auto px-4">
        <SidebarLink
          href="/app"
          icon={<Home className="h-4 w-4" />}
          active={isActivePath("/app", pathname, { exact: true })}
        >
          My Work
        </SidebarLink>

        {inWorkspace && currentWorkspace ? (
          <div className="space-y-1 pt-1">
            <SidebarLink
              href={wsBase}
              icon={<LayoutDashboard className="h-4 w-4" />}
              active={isActivePath(wsBase, pathname, { exact: true })}
            >
              Overview
            </SidebarLink>
            <SidebarLink
              href={`${wsBase}/planning`}
              icon={<ClipboardList className="h-4 w-4" />}
              active={isActivePath(`${wsBase}/planning`, pathname)}
            >
              Planning
            </SidebarLink>
            <SidebarLink
              href={`${wsBase}/calendar`}
              icon={<CalendarDays className="h-4 w-4" />}
              active={isActivePath(`${wsBase}/calendar`, pathname)}
            >
              Calendar
            </SidebarLink>
            <SidebarLink
              href={`${wsBase}/reviews`}
              icon={<MessageSquare className="h-4 w-4" />}
              active={isActivePath(`${wsBase}/reviews`, pathname)}
            >
              Reviews
            </SidebarLink>
            <SidebarLink
              href={`${wsBase}/channels`}
              icon={<Share2 className="h-4 w-4" />}
              active={isActivePath(`${wsBase}/channels`, pathname)}
            >
              Social Channels
            </SidebarLink>
            <SidebarLink
              href={`${wsBase}/brand-kit`}
              icon={<Package className="h-4 w-4" />}
              active={isActivePath(`${wsBase}/brand-kit`, pathname)}
            >
              Brand Kit
            </SidebarLink>
            <SidebarLink
              href={`${wsBase}/team`}
              icon={<Users className="h-4 w-4" />}
              active={isActivePath(`${wsBase}/team`, pathname)}
            >
              Team
            </SidebarLink>
          </div>
        ) : (
          <>
            <SidebarLink
              href="/app/workspaces"
              icon={<Briefcase className="h-4 w-4" />}
              active={isActivePath("/app/workspaces", pathname)}
            >
              Workspaces
            </SidebarLink>
            {user.isAdmin ? (
              <>
                <div className="text-label text-fg-muted px-2 pt-6 pb-2 font-semibold tracking-wide uppercase">
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
          </>
        )}
      </div>

      {/* Bottom section: actions + meta + switcher */}
      <div className="border-border mt-auto space-y-1 border-t p-4 pt-4">
        {inWorkspace && currentWorkspace ? (
          <Link
            href={`${wsBase}/planning/new`}
            className="bg-primary-container text-on-primary-container hover:bg-primary-hover text-button flex min-h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] px-3 py-2 font-semibold transition-colors"
            data-testid="sidebar-create-content"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Create content
          </Link>
        ) : null}

        {inWorkspace ? (
          <SidebarLink
            href={`${wsBase}/settings`}
            icon={<Settings className="h-4 w-4" />}
            active={isActivePath(`${wsBase}/settings`, pathname)}
          >
            Settings
          </SidebarLink>
        ) : null}

        {user.isAdmin && inWorkspace ? (
          <SidebarLink
            href={`${wsBase}/team`}
            icon={<Shield className="h-4 w-4" />}
            active={isActivePath(`${wsBase}/team`, pathname)}
          >
            Admin
          </SidebarLink>
        ) : null}

        <SidebarLink
          href="https://github.com/LaraTik/laratik-planner"
          icon={<HelpCircle className="h-4 w-4" />}
          active={false}
        >
          Help
        </SidebarLink>

        {/* Workspace switcher lives in the sidebar bottom (per Stitch). */}
        <div className="pt-2">
          <WorkspaceSwitcher
            active={currentWorkspace ?? workspaceSwitcherOptions[0] ?? null}
            options={workspaceSwitcherOptions}
            canCreate={canCreateWorkspace}
            testId="sidebar-workspace-switcher-trigger"
          />
        </div>
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

// ArrowLeftRight is intentionally not used in the rendered nav itself —
// it is the canonical "switch" icon in the Stitch design and is used
// as a fallback by the WorkspaceSwitcher's chevron when no other icon
// is supplied. Importing it keeps the design-system intent discoverable.
void ArrowLeftRight;
