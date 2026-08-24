"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Bot,
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
  Gauge,
  Share2,
  Shield,
  ShieldCheck,
  Users,
  Lock,
} from "lucide-react";
import { isActivePath } from "@/lib/utils";
import { WorkspaceSwitcher } from "./workspace-switcher";
import { AgencySwitcher, type AgencyRow } from "./agency-switcher";
import { SidebarGroup, SidebarLink, SidebarSubLink } from "./sidebar-group";

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
 *      - Settings (expandable group): Lifecycle, Lead times,
 *        Assignment defaults, Approval mode, AI assistance
 *      - Help, Workspace Switcher (bottom)
 *
 *  - On a global page (/app, /app/workspaces, /app/users, ...):
 *      - Brand: logo only
 *      - My Work, Workspaces
 *      - (admin only) User Management, Agency Settings
 *        (with nested: General, AI configuration)
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
  agencySwitcher,
  canCreateWorkspace,
  isPlatformAdmin = false,
}: {
  user: { name: string; isAdmin: boolean };
  workspaces: { id: string; slug: string; name: string }[];
  workspaceSwitcherOptions: { id: string; name: string; slug: string }[];
  agencySwitcher: { active: AgencyRow | null; options: AgencyRow[] };
  canCreateWorkspace: boolean;
  isPlatformAdmin?: boolean;
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

            <div className="pt-2" />

            <SidebarGroup
              href={`${wsBase}/settings`}
              icon={<Settings className="h-4 w-4" />}
              label="Settings"
              pathname={pathname}
              defaultOpen={isActivePath(`${wsBase}/settings`, pathname)}
              parentTestId="sidebar-settings"
            >
              <SidebarSubLink
                href={`${wsBase}/settings#lifecycle`}
                active={
                  pathname === `${wsBase}/settings` &&
                  !!pathname.match(/#lifecycle$|^\/app\/w\/[^/]+\/settings$/)
                }
              >
                Lifecycle
              </SidebarSubLink>
              <SidebarSubLink
                href={`${wsBase}/settings#lead-times`}
                active={pathname.includes("/settings") && pathname.endsWith("#lead-times")}
              >
                Lead times
              </SidebarSubLink>
              <SidebarSubLink
                href={`${wsBase}/settings#defaults`}
                active={pathname.includes("/settings") && pathname.endsWith("#defaults")}
              >
                Assignment defaults
              </SidebarSubLink>
              <SidebarSubLink
                href={`${wsBase}/settings#approvals`}
                active={pathname.includes("/settings") && pathname.endsWith("#approvals")}
              >
                Approval mode
              </SidebarSubLink>
              <SidebarSubLink
                href={`${wsBase}/ai-settings`}
                active={isActivePath(`${wsBase}/ai-settings`, pathname)}
              >
                <Bot className="h-3.5 w-3.5" aria-hidden="true" /> AI assistance
              </SidebarSubLink>
            </SidebarGroup>
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
                <SidebarGroup
                  href="/app/agency-settings"
                  icon={<Shield className="h-4 w-4" />}
                  label="Agency Settings"
                  pathname={pathname}
                  defaultOpen={isActivePath("/app/agency-settings", pathname)}
                  parentTestId="sidebar-agency-settings"
                >
                  <SidebarSubLink
                    href="/app/agency-settings"
                    active={isActivePath("/app/agency-settings", pathname, { exact: true })}
                  >
                    General
                  </SidebarSubLink>
                  <SidebarSubLink
                    href="/app/agency-settings/plan"
                    active={isActivePath("/app/agency-settings/plan", pathname)}
                  >
                    <Gauge className="h-3.5 w-3.5" aria-hidden="true" /> Plan and usage
                  </SidebarSubLink>
                  <SidebarSubLink
                    href="/app/agency-settings/ai"
                    active={isActivePath("/app/agency-settings/ai", pathname)}
                  >
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" /> AI configuration
                  </SidebarSubLink>
                </SidebarGroup>
              </>
            ) : null}
            {isPlatformAdmin ? (
              <>
                <div className="text-label text-fg-muted px-2 pt-6 pb-2 font-semibold tracking-wide uppercase">
                  Platform
                </div>
                <SidebarLink
                  href="/app/platform/overview"
                  icon={<LayoutDashboard className="h-4 w-4" />}
                  active={isActivePath("/app/platform/overview", pathname)}
                >
                  Platform overview
                </SidebarLink>
                <SidebarLink
                  href="/app/platform/agencies"
                  icon={<Shield className="h-4 w-4" />}
                  active={isActivePath("/app/platform/agencies", pathname)}
                >
                  Agencies
                </SidebarLink>
                <SidebarLink
                  href="/app/platform/security"
                  icon={<Lock className="h-4 w-4" />}
                  active={isActivePath("/app/platform/security", pathname)}
                >
                  Security & support
                </SidebarLink>
                <SidebarLink
                  href="/app/platform/admins"
                  icon={<ShieldCheck className="h-4 w-4" />}
                  active={isActivePath("/app/platform/admins", pathname)}
                >
                  Platform admins
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

        <SidebarLink
          href="https://github.com/LaraTik/laratik-planner"
          icon={<HelpCircle className="h-4 w-4" />}
          active={false}
        >
          Help
        </SidebarLink>

        {/* Agency switcher lives above the workspace switcher (per
            M1.5 + Stitch design). The active agency scopes the
            workspace list the user can pick from, so the agency
            switcher is the outermost switcher. */}
        <div className="pt-2">
          <AgencySwitcher
            active={agencySwitcher.active}
            options={agencySwitcher.options}
            testId="sidebar-agency-switcher-trigger"
          />
        </div>

        {/* Workspace switcher lives in the sidebar bottom (per Stitch). */}
        <div className="pt-1">
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

// ArrowLeftRight is intentionally not used in the rendered nav itself —
// it is the canonical "switch" icon in the Stitch design and is used
// as a fallback by the WorkspaceSwitcher's chevron when no other icon
// is supplied. Importing it keeps the design-system intent discoverable.
void ArrowLeftRight;
